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

  // Calculate the exact center coordinates of the map
  getMapCenter(): Vector2 {
    // Calculate center in grid coordinates
    const centerGridX = Math.floor(this.data.width / 2);
    const centerGridY = Math.floor(this.data.height / 2);
    
    // Convert to pixel coordinates (multiply by 32px grid size)
    const centerPixelX = centerGridX * 32;
    const centerPixelY = centerGridY * 32;
    
    return { x: centerPixelX, y: centerPixelY };
  }

  // Get a safe spawn position at map center with fallback strategy
  getCenterSpawn(): Vector2 {
    const mapCenter = this.getMapCenter();
    
    // First, try the exact center
    if (this.isPositionSafe(mapCenter.x, mapCenter.y, 32, 32)) {
      console.log(`Player spawning at exact map center: (${mapCenter.x}, ${mapCenter.y})`);
      return mapCenter;
    }
    
    console.log(`Map center (${mapCenter.x}, ${mapCenter.y}) is blocked, searching for nearest safe position...`);
    
    // Fallback: Find nearest safe position to center using spiral search
    return this.findSafeSpawnPosition(mapCenter, 32);
  }

  // Check if a position is safe for player spawning (no collision with walls/trees)
  isPositionSafe(x: number, y: number, width: number = 32, height: number = 32): boolean {
    // Convert pixel coordinates to grid coordinates
    const gridX1 = Math.floor(x / 32);
    const gridY1 = Math.floor(y / 32);
    const gridX2 = Math.floor((x + width - 1) / 32);
    const gridY2 = Math.floor((y + height - 1) / 32);
    
    // Check all grid cells that the player would occupy
    for (let gridY = gridY1; gridY <= gridY2; gridY++) {
      for (let gridX = gridX1; gridX <= gridX2; gridX++) {
        if (this.isWall(gridX, gridY)) {
          return false;
        }
      }
    }
    
    return true;
  }

  // Find a safe spawn position near the intended position
  findSafeSpawnPosition(intendedPosition: Vector2, playerSize: number = 32): Vector2 {
    // First check if the intended position is already safe
    if (this.isPositionSafe(intendedPosition.x, intendedPosition.y, playerSize, playerSize)) {
      return { ...intendedPosition };
    }
    
    // Search in a spiral pattern around the intended position
    const maxSearchRadius = 5; // Maximum 5 grid cells away
    const gridSize = 32;
    
    for (let radius = 1; radius <= maxSearchRadius; radius++) {
      // Check positions in a square pattern around the center
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          // Only check the perimeter of the current radius
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
            continue;
          }
          
          const testX = intendedPosition.x + (dx * gridSize);
          const testY = intendedPosition.y + (dy * gridSize);
          
          // Check if position is within game boundaries
          if (testX >= 0 && testY >= 0 && 
              testX + playerSize <= this.data.width * gridSize && 
              testY + playerSize <= this.data.height * gridSize) {
            
            if (this.isPositionSafe(testX, testY, playerSize, playerSize)) {
              console.log(`Found safe spawn position at (${testX}, ${testY}) after collision detected at intended position (${intendedPosition.x}, ${intendedPosition.y})`);
              return { x: testX, y: testY };
            }
          }
        }
      }
    }
    
    // Fallback: try predefined safe zones (corners and center areas)
    const fallbackPositions = [
      { x: 64, y: 64 },     // Top-left safe area
      { x: 64, y: 544 },    // Bottom-left safe area
      { x: 704, y: 64 },    // Top-right safe area
      { x: 704, y: 544 },   // Bottom-right safe area
      { x: 384, y: 288 }    // Center area
    ];
    
    for (const fallback of fallbackPositions) {
      if (this.isPositionSafe(fallback.x, fallback.y, playerSize, playerSize)) {
        console.warn(`Using fallback spawn position at (${fallback.x}, ${fallback.y}) - original position (${intendedPosition.x}, ${intendedPosition.y}) was unsafe`);
        return { ...fallback };
      }
    }
    
    // Last resort: return intended position with warning
    console.error(`Could not find safe spawn position! Using intended position (${intendedPosition.x}, ${intendedPosition.y}) - player may spawn in wall`);
    return { ...intendedPosition };
  }

  // Get a validated safe player spawn position
  getSafePlayerSpawn(): Vector2 {
    // Always spawn at map center, not the predefined spawn point
    return this.getCenterSpawn();
  }

  // Get all valid edge spawn positions for enemies
  getEdgeSpawnPositions(): Vector2[] {
    const edgePositions: Vector2[] = [];
    const gridSize = 32;
    
    // Top edge (y = 1, skip corners for better distribution)
    for (let x = 2; x < this.data.width - 2; x++) {
      const pixelX = x * gridSize;
      const pixelY = 1 * gridSize;
      if (this.isPositionSafe(pixelX, pixelY, 32, 32)) {
        edgePositions.push({ x: pixelX, y: pixelY });
      }
    }
    
    // Bottom edge (y = height - 2, skip corners)
    for (let x = 2; x < this.data.width - 2; x++) {
      const pixelX = x * gridSize;
      const pixelY = (this.data.height - 2) * gridSize;
      if (this.isPositionSafe(pixelX, pixelY, 32, 32)) {
        edgePositions.push({ x: pixelX, y: pixelY });
      }
    }
    
    // Left edge (x = 1, skip corners)
    for (let y = 2; y < this.data.height - 2; y++) {
      const pixelX = 1 * gridSize;
      const pixelY = y * gridSize;
      if (this.isPositionSafe(pixelX, pixelY, 32, 32)) {
        edgePositions.push({ x: pixelX, y: pixelY });
      }
    }
    
    // Right edge (x = width - 2, skip corners)
    for (let y = 2; y < this.data.height - 2; y++) {
      const pixelX = (this.data.width - 2) * gridSize;
      const pixelY = y * gridSize;
      if (this.isPositionSafe(pixelX, pixelY, 32, 32)) {
        edgePositions.push({ x: pixelX, y: pixelY });
      }
    }
    
    return edgePositions;
  }

  // Generate enemy spawns at edge positions with minimum distance from player
  generateEdgeEnemySpawns(enemyCount: number, minDistanceFromPlayer: number = 128): EnemySpawn[] {
    const edgePositions = this.getEdgeSpawnPositions();
    const playerCenter = this.getMapCenter();
    const enemyTypes: EnemyType[] = ['panther', 'primate', 'bear'];
    
    // Filter positions that are far enough from player spawn
    const validPositions = edgePositions.filter(pos => {
      const distance = Math.sqrt(
        Math.pow(pos.x - playerCenter.x, 2) + 
        Math.pow(pos.y - playerCenter.y, 2)
      );
      return distance >= minDistanceFromPlayer;
    });
    
    if (validPositions.length === 0) {
      console.warn('No valid edge positions found for enemy spawning');
      return [];
    }
    
    const spawns: EnemySpawn[] = [];
    const usedPositions = new Set<string>();
    
    for (let i = 0; i < enemyCount; i++) {
      // Try to find an unused position
      let attempts = 0;
      let selectedPosition: Vector2 | null = null;
      
      while (attempts < 50 && !selectedPosition) {
        const randomIndex = Math.floor(Math.random() * validPositions.length);
        const candidate = validPositions[randomIndex];
        const posKey = `${candidate.x},${candidate.y}`;
        
        if (!usedPositions.has(posKey)) {
          selectedPosition = candidate;
          usedPositions.add(posKey);
        }
        attempts++;
      }
      
      if (selectedPosition) {
        const randomType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
        spawns.push({
          pos: { ...selectedPosition },
          type: randomType
        });
      }
    }
    
    console.log(`Generated ${spawns.length} edge enemy spawns out of ${enemyCount} requested`);
    return spawns;
  }

  // Check if position has line of sight to player (for advanced spawn logic)
  hasLineOfSightToPlayer(enemyPos: Vector2, playerPos: Vector2): boolean {
    const dx = playerPos.x - enemyPos.x;
    const dy = playerPos.y - enemyPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return true;
    
    const steps = Math.ceil(distance / 16); // Check every 16 pixels
    const stepX = dx / steps;
    const stepY = dy / steps;
    
    for (let i = 1; i < steps; i++) {
      const checkX = enemyPos.x + stepX * i;
      const checkY = enemyPos.y + stepY * i;
      const gridX = Math.floor(checkX / 32);
      const gridY = Math.floor(checkY / 32);
      
      if (this.isWall(gridX, gridY)) {
        return false; // Line of sight blocked
      }
    }
    
    return true; // Clear line of sight
  }
}