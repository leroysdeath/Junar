export type GameState = 'menu' | 'playing' | 'gameOver' | 'victory' | 'levelComplete';

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
  onLevelChange: (level: number) => void;
  onScoreChange: (score: number) => void;
  onEnemiesChange: (count: number) => void;
  onWaveStart?: (waveIndex: number, totalWaves: number, beatRole: BeatRole) => void;
  onWaveComplete?: (waveIndex: number) => void;
  onLullStart?: (durationMs: number) => void;
  // Wave-driven levels (1–3): live + queued enemies for the current wave
  // and across the rest of the level. Not emitted on legacy levels.
  onWaveProgressChange?: (remainingInWave: number, remainingInLevel: number) => void;
  // Stamina + burst signals. isLow is bundled with value to avoid a
  // render race between the bar value and its low-state styling.
  onStaminaChange?: (value: number, isLow: boolean) => void;
  onBurstChange?: (active: boolean, multiplier: number, endsAtMs: number) => void;
  soundEnabled: boolean;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

// Cardinal facing direction, set by Player based on the most recent
// directional input. Drives both the player render variant and the dash
// direction (dash teleports opposite of facing).
export type Facing = 'up' | 'down' | 'left' | 'right';

export type EnemyType = 'panther' | 'snake' | 'gibbon' | 'bear';

export interface EnemySpawn {
  pos: Vector2;
  type: EnemyType;
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

// A pre-designed group template. `cells[row][col]` describes which enemy
// (if any) occupies each grid cell. Outer index = row (0 = front, enters
// first); inner index = column (0 = outside-left, 1 = middle, 2 =
// outside-right). Rows trail behind the front row at one-tile spacing
// along the band's reverse-entry direction.
export interface SpawnTemplate {
  id: string;
  cells: (EnemyType | null)[][];
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
