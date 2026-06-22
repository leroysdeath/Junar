// 'levelComplete' was removed in Step 3 (traversable-maps): there is no
// per-level clear-to-advance flow any more — progression is room-to-room.
// 'victory' is retained but dormant until Step 9 wires the boss-room win.
export type GameState = 'menu' | 'playing' | 'gameOver' | 'victory';

export interface Vector2 {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameCallbacks {
  onStateChange: (state: GameState) => void;
  // Room-grid HUD signals (Step 3). onRoomChange fires when the player
  // enters a room (run start + every transition); onWaveChange fires when
  // the global scheduler advances its run-long wave number.
  onRoomChange: (coord: RoomGridCoord) => void;
  onWaveChange?: (waveNum: number) => void;
  // Boss-arena sub-state (Step 9). Fires true when the player enters the boss
  // room (anchor 10) and false when they leave it (or on run start/restart).
  // The game stays in the 'playing' state throughout — this drives a
  // non-blocking "Reached Boss" overlay, not a state switch.
  onBossArenaChange?: (active: boolean) => void;
  onScoreChange: (score: number) => void;
  // Total enemies killed this run (monotonic; resets on a new run). Mirrors
  // onScoreChange. Distinct from onEnemiesChange, which reports the live in-room
  // enemy count — see Game.enemiesKilled.
  onKillsChange: (kills: number) => void;
  onEnemiesChange: (count: number) => void;
  // Fires once when a run ends in game over, with the run's wall-clock
  // duration in ms (performance.now() − run start). Drives the "Time" stat on
  // the Game Over screen; total kills/score come from their own signals.
  onRunEnd?: (elapsedMs: number) => void;
  // Energy (stamina) + burst + sprint signals. isLow is bundled with value to
  // avoid a render race between the bar value and its low-state styling.
  onStaminaChange?: (value: number, isLow: boolean) => void;
  onBurstChange?: (
    active: boolean,
    multiplier: number,
    endsAtMs: number,
  ) => void;
  // Sprint twin of onBurstChange (movement-speed boost). Same shape.
  onSprintChange?: (
    active: boolean,
    multiplier: number,
    endsAtMs: number,
  ) => void;
  soundEnabled: boolean;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

// Cardinal facing direction, set by Player based on the most recent
// directional input. Drives the player render variant (which directional
// sprite is drawn).
export type Facing = 'up' | 'down' | 'left' | 'right';

export type EnemyType = 'panther' | 'snake' | 'gibbon' | 'bear';

export interface EnemySpawn {
  pos: Vector2;
  type: EnemyType;
}

// A mango pickup (owner 2026-06-19). A static collectible placed at a dead-end
// chamber's centre; walking over it grants energy and flips `collected`. Lives
// per-room in Game.roomMangos, rolled once on first room entry (5 per run).
export interface Mango {
  tile: Vector2; // top-left of the cell it sits in (world px)
  collected: boolean;
}

// A village hut (owner 2026-06-21). Parsed from the village arena's hut
// footprints — 's' = small (2×2), 'S' = large (3×3) — into a foot-anchor: `pos`
// is the bottom-centre of the footprint in world px, so the renderer draws the
// hut sprite centred on it and overflowing upward (like a tree/player). Render-
// only decoration; the footprint tiles stay walkable floor (collision = walls).
export interface Hut {
  pos: Vector2;
  size: 'small' | 'large';
}

// A rectangular band, in world-space pixels, where enemies can appear.
// Typically positioned just outside the canvas so they walk in.
export interface SpawnEntryway {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Runtime-driven enemy spawning: enemies appear over time at the entryway
// rather than all at once at level start. Used in place of static
// enemySpawns when set on a level.
export interface DelayedSpawnConfig {
  entryway: SpawnEntryway;
  // Direction enemies walk while still partially outside the canvas
  // (cardinal unit vector — e.g. {x:0, y:1} for top-down entry).
  entryDirection: Vector2;
  count: number;
  initialDelayMs: number;
  intervalMs: number;
}

export interface LevelData {
  width: number;
  height: number;
  walls: boolean[][];
  playerSpawn: Vector2;
  enemySpawns: EnemySpawn[];
  npcPositions: Vector2[];
  hutPositions: Vector2[];
  huts?: Hut[];
  hutTiles?: boolean[][];
  delayedSpawns?: DelayedSpawnConfig;
  waveConfig?: LevelWaveConfig;
}

// Authored beat slot a wave fills inside its level. Future authoring tools
// can lean on this enum; the MVP scheduler treats it as metadata only.
export type BeatRole =
  | 'setup'
  | 'add'
  | 'test'
  | 'npc_encounter'
  | 'mid_beat'
  | 'recovery'
  | 'add_final'
  | 'density'
  | 'pre_boss'
  | 'boss';

// A 3-tile-wide band sitting one tile outside the canvas where group
// templates land. `rect` is the front row in pixel space (3 tiles along
// the orthogonal axis × 1 tile along the entry axis). `entryDirection`
// is the cardinal unit vector pointing inward; rows further back along
// the band sit at -entryDirection × N × TILE_SIZE from `rect`.
export interface BandSpec {
  rect: Rectangle;
  entryDirection: Vector2;
}

// A pre-designed group template. `rows[i]` is the ordered list of enemies
// that enter together in row i (0 = front, enters first). Within a row the
// enemies lay out along the band's orthogonal axis, left-justified by
// cumulative AABB width (see WaveScheduler.slotPosition; Step 1 uses a
// uniform TILE_SIZE width per type, Step 2 swaps in per-type widths). Rows
// trail behind the front row at one-tile spacing along the band's
// reverse-entry direction. (Replaces the old `cells: (EnemyType|null)[][]`
// grid — see docs/ROADMAP-traversable-maps.md §5.6.)
export interface SpawnTemplate {
  id: string;
  rows: EnemyType[][];
}

// Wave: keep drawing groups until cumulative spawned enemies meet or
// exceed `enemyCount` (soft target — the last group may overshoot).
// Groups are drawn from the level's `groupPool`, except `firstSpawnPool`
// — when set, it's used for the wave's very first draw.
export interface WaveTemplate {
  id: string;
  beatRole: BeatRole;
  enemyCount: number;
  spawnIntervalMs: number;
  firstSpawnPool?: SpawnTemplate[];
}

export interface LevelWaveConfig {
  waves: WaveTemplate[];
  interWaveLullMs: number;
  bands: BandSpec[];
  groupPool: SpawnTemplate[];
}

// ───────────────────────────────────────────────────────────────────────────
// Traversable-maps refactor (see docs/ROADMAP-traversable-maps.md §11).
// These types support the room-grid system. Step 8 (this slice) uses
// RoomTemplate / RoomOpening / StaticCandidate to author the connector
// template pool in RoomTemplates.ts. Later steps consume the rest.
// ───────────────────────────────────────────────────────────────────────────

// One of the four canvas edges. N = top (row 0), S = bottom (row GRID_HEIGHT-1),
// W = left (col 0), E = right (col GRID_WIDTH-1).
export type Edge = 'N' | 'S' | 'E' | 'W';

// A walkable gap on one edge of a room template. For N/S edges the range is a
// span of column indices; for E/W edges it's a span of row indices. Both ends
// are inclusive. A single edge may carry multiple openings (multi-opening
// templates), each emitted as its own RoomOpening.
export interface RoomOpening {
  edge: Edge;
  rangeStart: number; // tile index along the edge (inclusive)
  rangeEnd: number; // tile index along the edge (inclusive)
}

// Static spawn candidate kind, sourced from the template tile char:
//   's' → 'small' (snake or gibbon only)
//   'S' → 'any'   (any 1-tile-fitting type: snake, gibbon, or panther)
// Bears (34 px) never spawn statically; they come from waves only.
export type StaticCandidateKind = 'small' | 'any';

// A candidate tile where the per-run density roll (§5.10) may place a static.
// `tile` holds the world-space pixel position (col*TILE_SIZE, row*TILE_SIZE),
// matching how levels.ts records NPC/hut positions.
export interface StaticCandidate {
  tile: Vector2;
  kind: StaticCandidateKind;
}

// A parsed room (anchor or connector). `walls` is the 29×17 collision grid
// (walls[row][col]); `openings` and `candidates` are derived from the source
// ASCII. `authoredStatics` is an anchors-only manifest of pre-placed statics —
// empty for connectors, which roll their statics from `candidates` at run time.
export interface RoomTemplate {
  id: string;
  walls: boolean[][];
  openings: RoomOpening[];
  candidates: StaticCandidate[];
  authoredStatics: { type: EnemyType; pos: Vector2 }[];
}

// ───────────────────────────────────────────────────────────────────────────
// Room grid (Step 3). A run is a ROOM_GRID_COLS × ROOM_GRID_ROWS grid of
// rooms, regenerated each run; the player traverses it from anchor 1 toward
// the boss (anchor 10). See docs/ROADMAP-traversable-maps.md §4, §5.1, §5.3.
// ───────────────────────────────────────────────────────────────────────────

// Position of a room within the room grid. Distinct from in-room tile coords.
export interface RoomGridCoord {
  col: number; // 0..ROOM_GRID_COLS-1
  row: number; // 0..ROOM_GRID_ROWS-1
}

// Hunt state machine (Step 4, roadmap §5.12). Lives on each Enemy; driven by
// Hunt.ts off the gameLoop currentTime and room-grid position.
//   dormant    — a placed static, asleep until the player enters its room
//   activating — woken; counting down STATIC_AGGRO_DELAY_MS before it pursues
//   active     — pursuing the player inside the player's current room
//   hunting    — pursuing the player across rooms (player has left its room)
export type HuntState = 'dormant' | 'activating' | 'active' | 'hunting';

export type RoomKind = 'anchor' | 'connector' | 'miniboss';

// A resolved room placed in the grid. Connectors are drawn from the connector
// template pool; the `anchor` kind now covers the required start L-bend, the
// boss arena versions, and the mango dead-ends (the hand-designed levels are
// demoted to connectors). `walls`/`openings` drive collision, rendering,
// transitions and per-opening wave bands. `candidates`/`authoredStatics` feed
// the static-spawn roll. `npcPositions`/`hutPositions` are currently empty
// everywhere (family rendering paused — see CLAUDE.md §6).
export interface RoomDef {
  kind: RoomKind;
  templateId: string;
  // Vestigial since the 2026-06-20 restructure (start/boss/mango are now
  // identified by RunMap coords, not this field): always null in current defs.
  // Retained on the interface so older debug tooling that reads it still compiles.
  anchorIndex: number | null;
  walls: boolean[][];
  openings: RoomOpening[];
  candidates: StaticCandidate[];
  authoredStatics: { type: EnemyType; pos: Vector2 }[];
  npcPositions: Vector2[];
  hutPositions: Vector2[];
  // Sized village huts parsed from the arena's 's'/'S' footprints (owner
  // 2026-06-21). Only the village def populates this; undefined elsewhere.
  huts?: Hut[];
  // Per-tile mask of the hut footprints (owner 2026-06-21): these tiles are
  // SOLID in `walls` but render as dirt (not trees) under the hut sprite.
  hutTiles?: boolean[][];
}

// A generated run: the room grid plus the guaranteed-room placements.
// `cells[row][col]` indexes a RoomDef (connector RoomDefs are shared by
// reference across cells using the same template). `startCoord` is the run-start
// L-bend; `bossCoord` is the boss arena (farthest from start).
export interface RunMap {
  cols: number;
  rows: number;
  cells: RoomDef[][];
  startCoord: RoomGridCoord;
  bossCoord: RoomGridCoord;
  // World-px centre of the boss version's 3×3 stump — the run's win trigger
  // (Game.isTouchingGrowthHeart). Varies by which of the four boss arenas rolled.
  bossStumpCenter: Vector2;
  // Mini-boss rooms (owner 2026-06-19): MINIBOSS_COUNT wide-open arenas. Three
  // are empty; `pantherBossCoord` is the one (farthest from start) that spawns
  // the enlarged panther mini-boss.
  minibossCoords: RoomGridCoord[];
  pantherBossCoord: RoomGridCoord;
  // The five dead-end rooms (owner 2026-06-20) that hold the run's mangos; Game
  // places one mango per room on first entry.
  mangoRoomCoords: RoomGridCoord[];
  // The "village" required room (owner 2026-06-21). Its four orthogonal
  // neighbours are force-placed "arrow" rooms, each pointing inward at the
  // village (RoomGrid: N=arrow-s, S=arrow-n, W=arrow-e, E=arrow-w).
  villageCoord: RoomGridCoord;
}
