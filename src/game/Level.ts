import { Vector2, EnemySpawn, LevelData } from './types';

export class Level {
  private data: LevelData;

  constructor(levelData: LevelData) {
    this.data = levelData;
  }

  isWall(x: number, y: number): boolean {
    if (x < 0 || x >= this.data.width || y < 0 || y >= this.data.height) {
      return true; // Boundaries are walls
    }
    return this.data.walls[y][x];
  }

  getPlayerSpawn(): Vector2 {
    return { ...this.data.playerSpawn };
  }

  getEnemySpawns(): EnemySpawn[] {
    return this.data.enemySpawns.map(spawn => ({
      pos: { ...spawn.pos },
      type: spawn.type
    }));
  }

  getWidth(): number {
    return this.data.width;
  }

  getHeight(): number {
    return this.data.height;
  }

  getWalls(): boolean[][] {
    return this.data.walls;
  }
}