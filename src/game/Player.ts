import { Vector2, InputState } from './types';
import { Level } from './Level';
import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE } from './constants';

export interface WallRejection {
  axis: 'x' | 'y';
  from: number;
  attempted: number;
  cells: Array<{ x: number; y: number }>;
}

export class Player {
  private position: Vector2;
  private speed = 150; // pixels per second
  private size = 32;

  constructor(startPosition: Vector2) {
    this.position = { ...startPosition };
  }

  update(
    deltaTime: number,
    input: InputState,
    level: Level,
    onWallReject?: (rej: WallRejection) => void,
  ) {
    const moveDistance = this.speed * (deltaTime / 1000);
    let newX = this.position.x;
    let newY = this.position.y;

    if (input.left) newX -= moveDistance;
    if (input.right) newX += moveDistance;
    if (input.up) newY -= moveDistance;
    if (input.down) newY += moveDistance;

    newX = Math.max(0, Math.min(newX, CANVAS_WIDTH - this.size));
    newY = Math.max(0, Math.min(newY, CANVAS_HEIGHT - this.size));

    const wantedX = newX !== this.position.x;
    const wantedY = newY !== this.position.y;

    const gridX = Math.floor(newX / TILE_SIZE);
    const gridY = Math.floor(newY / TILE_SIZE);
    const gridX2 = Math.floor((newX + this.size - 1) / TILE_SIZE);
    const gridY2 = Math.floor((newY + this.size - 1) / TILE_SIZE);
    const curRowTop = Math.floor(this.position.y / TILE_SIZE);
    const curRowBot = Math.floor((this.position.y + this.size - 1) / TILE_SIZE);
    const curColLeft = Math.floor(this.position.x / TILE_SIZE);
    const curColRight = Math.floor((this.position.x + this.size - 1) / TILE_SIZE);

    const horizCells = [
      { x: gridX, y: curRowTop },
      { x: gridX2, y: curRowTop },
      { x: gridX, y: curRowBot },
      { x: gridX2, y: curRowBot },
    ];
    const horizBlocked = horizCells.some((c) => level.isWall(c.x, c.y));

    if (!horizBlocked) {
      this.position.x = newX;
    } else if (wantedX && onWallReject) {
      onWallReject({
        axis: 'x',
        from: this.position.x,
        attempted: newX,
        cells: horizCells.filter((c) => level.isWall(c.x, c.y)),
      });
    }

    const vertCells = [
      { x: curColLeft, y: gridY },
      { x: curColRight, y: gridY },
      { x: curColLeft, y: gridY2 },
      { x: curColRight, y: gridY2 },
    ];
    const vertBlocked = vertCells.some((c) => level.isWall(c.x, c.y));

    if (!vertBlocked) {
      this.position.y = newY;
    } else if (wantedY && onWallReject) {
      onWallReject({
        axis: 'y',
        from: this.position.y,
        attempted: newY,
        cells: vertCells.filter((c) => level.isWall(c.x, c.y)),
      });
    }
  }

  getPosition(): Vector2 {
    return { ...this.position };
  }
}