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
  soundEnabled: boolean;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

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

// Fixed-count wave: spawn exactly `enemyCount` enemies, one every
// `spawnIntervalMs`. The wave isn't "complete" until every spawned enemy
// is dead; only then does the scheduler enter the inter-wave lull. The
// optional `spawnZone` confines spawns to a rectangle (e.g. Level 1's
// entryway band) instead of the level perimeter.
export interface WaveTemplate {
  id: string;
  beatRole: BeatRole;
  enemyPool: EnemyType[];
  enemyCount: number;
  spawnIntervalMs: number;
  spawnZone?: Rectangle;
  // Optional: spawned enemies use this entry direction (cardinal unit
  // vector) and skip wall collision until fully on-canvas. Used when
  // `spawnZone` sits outside the playfield, like the L1 entryway band.
  entryDirection?: Vector2;
}

export interface LevelWaveConfig {
  waves: WaveTemplate[];
  interWaveLullMs: number;
}