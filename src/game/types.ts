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
  soundEnabled: boolean;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export type EnemyType = 'panther' | 'primate' | 'bear';

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
}