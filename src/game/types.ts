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