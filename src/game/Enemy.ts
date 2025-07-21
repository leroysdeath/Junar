import { Vector2, EnemyType } from './types';
import { Level } from './Level';

export class Enemy {
  private position: Vector2;
  private type: EnemyType;
  private id: number;
  private speed: number;
  private size = 32;
  private lastPathfindTime = 0;
  private targetPosition: Vector2;

  constructor(startPosition: Vector2, type: EnemyType, id: number, level?: Level) {
    // Validate spawn position for enemies too
    if (level) {
      this.position = level.findSafeSpawnPosition(startPosition, this.size);
    } else {
      this.position = { ...startPosition };
    }
    this.type = type;
    this.id = id;
    this.targetPosition = { ...startPosition };
    
    // Different speeds for different enemy types
    switch (type) {
      case 'panther':
        this.speed = 120;
        break;
      case 'primate':
        this.speed = 80;
        break;
      case 'bear':
        this.speed = 60;
        break;
    }
  }

  update(deltaTime: number, playerPosition: Vector2, level: Level) {
    const currentTime = Date.now();
    
    // Update pathfinding target every 200ms
    if (currentTime - this.lastPathfindTime > 200) {
      this.targetPosition = this.findPathToPlayer(playerPosition, level);
      this.lastPathfindTime = currentTime;
    }
    
    // Move towards target
    const dx = this.targetPosition.x - this.position.x;
    const dy = this.targetPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 5) {
      const moveDistance = this.speed * (deltaTime / 1000);
      const normalizedX = dx / distance;
      const normalizedY = dy / distance;
      
      let newX = this.position.x + normalizedX * moveDistance;
      let newY = this.position.y + normalizedY * moveDistance;
      
      // Collision detection with walls
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
  }

  private findPathToPlayer(playerPosition: Vector2, level: Level): Vector2 {
    // Simple direct pathfinding - move towards player
    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return this.position;
    
    // Check if direct path is clear
    const steps = Math.ceil(distance / 16);
    const stepX = dx / steps;
    const stepY = dy / steps;
    
    for (let i = 1; i <= steps; i++) {
      const checkX = this.position.x + stepX * i;
      const checkY = this.position.y + stepY * i;
      const gridX = Math.floor(checkX / 32);
      const gridY = Math.floor(checkY / 32);
      
      if (level.isWall(gridX, gridY)) {
        // Path blocked, try alternative routes
        return this.findAlternativePath(playerPosition, level);
      }
    }
    
    return playerPosition;
  }

  private findAlternativePath(playerPosition: Vector2, level: Level): Vector2 {
    // Try moving in cardinal directions to find a clear path
    const directions = [
      { x: 0, y: -32 }, // Up
      { x: 32, y: 0 },  // Right
      { x: 0, y: 32 },  // Down
      { x: -32, y: 0 }  // Left
    ];
    
    let bestDirection = { x: 0, y: 0 };
    let bestScore = Infinity;
    
    directions.forEach(dir => {
      const newX = this.position.x + dir.x;
      const newY = this.position.y + dir.y;
      const gridX = Math.floor(newX / 32);
      const gridY = Math.floor(newY / 32);
      
      if (!level.isWall(gridX, gridY) && newX >= 0 && newX < 800 && newY >= 0 && newY < 600) {
        const distanceToPlayer = Math.sqrt(
          Math.pow(newX - playerPosition.x, 2) + 
          Math.pow(newY - playerPosition.y, 2)
        );
        
        if (distanceToPlayer < bestScore) {
          bestScore = distanceToPlayer;
          bestDirection = { x: newX, y: newY };
        }
      }
    });
    
    return bestDirection.x === 0 && bestDirection.y === 0 ? this.position : bestDirection;
  }

  getPosition(): Vector2 {
    return { ...this.position };
  }

  getType(): EnemyType {
    return this.type;
  }

  getId(): number {
    return this.id;
  }
}