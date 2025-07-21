import { Vector2, InputState } from './types';
import { Level } from './Level';

export class Player {
  private position: Vector2;
  private speed = 150; // pixels per second
  private size = 32;

  constructor(startPosition: Vector2) {
    this.position = { ...startPosition };
  }

  update(deltaTime: number, input: InputState, level: Level) {
    const moveDistance = this.speed * (deltaTime / 1000);
    let newX = this.position.x;
    let newY = this.position.y;

    // Calculate new position based on input
    if (input.left) newX -= moveDistance;
    if (input.right) newX += moveDistance;
    if (input.up) newY -= moveDistance;
    if (input.down) newY += moveDistance;

    // Check bounds
    newX = Math.max(0, Math.min(newX, 800 - this.size));
    newY = Math.max(0, Math.min(newY, 600 - this.size));

    // Check collision with walls
    const gridX = Math.floor(newX / 32);
    const gridY = Math.floor(newY / 32);
    const gridX2 = Math.floor((newX + this.size - 1) / 32);
    const gridY2 = Math.floor((newY + this.size - 1) / 32);

    // Check horizontal movement
    if (!level.isWall(gridX, Math.floor(this.position.y / 32)) && 
        !level.isWall(gridX2, Math.floor(this.position.y / 32)) &&
        !level.isWall(gridX, Math.floor((this.position.y + this.size - 1) / 32)) &&
        !level.isWall(gridX2, Math.floor((this.position.y + this.size - 1) / 32))) {
      this.position.x = newX;
    }

    // Check vertical movement
    if (!level.isWall(Math.floor(this.position.x / 32), gridY) && 
        !level.isWall(Math.floor((this.position.x + this.size - 1) / 32), gridY) &&
        !level.isWall(Math.floor(this.position.x / 32), gridY2) &&
        !level.isWall(Math.floor((this.position.x + this.size - 1) / 32), gridY2)) {
      this.position.y = newY;
    }
  }

  getPosition(): Vector2 {
    return { ...this.position };
  }
}