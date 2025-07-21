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

export interface LevelData {
  width: number;
  height: number;
  walls: boolean[][];
  playerSpawn: Vector2;
  enemySpawns: EnemySpawn[];
}