import { LevelData } from './types';

// Helper function to create a wall layout
function createWalls(width: number, height: number, layout: string[]): boolean[][] {
  const walls: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    walls[y] = [];
    for (let x = 0; x < width; x++) {
      if (y < layout.length && x < layout[y].length) {
        walls[y][x] = layout[y][x] === '#';
      } else {
        walls[y][x] = true; // Default to wall
      }
    }
  }
  return walls;
}

export const levels: LevelData[] = [
  // Level 1 - Simple maze introduction
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.###.#####.#####.#####.#',
      '#.......................#',
      '#.#####.###.###.#####.#.#',
      '#.......................#',
      '#.###.#####.#####.###.#.#',
      '#.......................#',
      '#.#.#####.###.#####.#.#.#',
      '#.......................#',
      '#.###.#####.#####.###.#.#',
      '#.......................#',
      '#.#####.###.###.#####.#.#',
      '#.......................#',
      '#.###.#####.#####.###.#.#',
      '#.......................#',
      '#.#####.###.###.#####.#.#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 64, y: 64 },
    enemySpawns: [] // Will be generated at edges
  },
  
  // Level 2 - More complex paths
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.###.###.#.###.###.###.#',
      '#.......................#',
      '#.#.###.#.#.#.###.#.###.#',
      '#.......................#',
      '#.###.#.###.###.#.#.#.#.#',
      '#.......................#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.###.#.###.#',
      '#.......................#',
      '#.###.#.###.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.###.#.###.#',
      '#.......................#',
      '#.###.###.#.###.###.###.#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 64, y: 64 },
    enemySpawns: [] // Will be generated at edges
  },
  
  // Level 3 - Winding maze paths
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.###.#.###.#.###.#.###.#',
      '#.......................#',
      '#.#.###.#.###.#.###.#.#.#',
      '#.......................#',
      '#.###.#.#.#.#.#.#.###.#.#',
      '#.......................#',
      '#.#.#.###.#.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.###.#.###.#.###.#',
      '#.......................#',
      '#.#.#.#.#.###.#.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.###.#.###.#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 64, y: 64 },
    enemySpawns: [] // Will be generated at edges
  },
  
  // Level 4 - Dense maze with multiple paths
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.#.###.#.###.#.###.#.#.#',
      '#.......................#',
      '#.###.#.#.#.#.#.#.###.#.#',
      '#.......................#',
      '#.#.#.###.#.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.###.###.#.###.#.#',
      '#.......................#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.###.#.###.#',
      '#.......................#',
      '#.###.#.###.#.###.#.#.#.#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 64, y: 64 },
    enemySpawns: [] // Will be generated at edges
  },
  
  // Level 5 - Complex interconnected maze
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.#.#.###.#.###.#.###.#.#',
      '#.......................#',
      '#.###.#.#.#.#.#.#.#.###.#',
      '#.......................#',
      '#.#.#.#.###.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.#.#.#.#.#.###.#.#',
      '#.......................#',
      '#.#.#.###.#.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.###.###.#.###.#.#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 64, y: 64 },
    enemySpawns: [] // Will be generated at edges
  },
  
  // Level 6 - Advanced maze with dead ends
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.###.#.#.###.#.#.###.#.#',
      '#.......................#',
      '#.#.#.###.#.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.#.#.#.#.#.###.#.#',
      '#.......................#',
      '#.#.#.###.#.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.###.###.#.###.#.#',
      '#.......................#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 64, y: 64 },
    enemySpawns: [] // Will be generated at edges
  },
  
  // Level 7 - Very complex maze
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.#.#.#.###.###.#.#.#.#.#',
      '#.......................#',
      '#.###.#.#.#.#.#.#.###.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.#.#.#.###.###.#.#.#.#.#',
      '#.......................#',
      '#.###.#.#.#.#.#.#.###.#.#',
      '#.......................#',
      '#.#.#.###.#.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.###.###.#.###.#.#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 64, y: 64 },
    enemySpawns: [] // Will be generated at edges
  },
  
  // Level 8 - Extremely dense maze
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.#.###.#.#.###.#.#',
      '#.......................#',
      '#.#.#.###.#.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.###.###.#.###.#.#',
      '#.......................#',
      '#.#.#.#.#.#.#.#.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.###.#.###.#',
      '#.......................#',
      '#.###.#.###.#.###.#.#.#.#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 64, y: 64 },
    enemySpawns: [] // Will be generated at edges
  },
  
  // Level 9 - Maximum complexity maze
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.#.#.#.#.###.#.#.#.#.#.#',
      '#.......................#',
      '#.###.#.#.#.#.#.#.###.#.#',
      '#.......................#',
      '#.#.#.###.#.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.#.#.#.#.#.###.#.#',
      '#.......................#',
      '#.#.#.###.#.###.#.#.#.#.#',
      '#.......................#',
      '#.#.###.#.#.#.#.###.#.#.#',
      '#.......................#',
      '#.###.#.###.###.#.###.#.#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 64, y: 64 },
    enemySpawns: [] // Will be generated at edges
  },
  
  // Level 10 - Boss Arena (open space design maintained)
  {
    width: 25,
    height: 19,
    walls: createWalls(25, 19, [
      '#########################',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#.......................#',
      '#########################'
    ]),
    playerSpawn: { x: 400, y: 304 }, // Map center: 25*32/2=400, 19*32/2=304
    enemySpawns: [] // Will be generated at edges
  }
];

// Generate enemy spawns for each level at runtime
export function initializeLevels(): LevelData[] {
  return levels.map((levelData, index) => {
    // Create a temporary level instance to access edge spawn methods
    const tempLevel = {
      data: levelData,
      isWall(x: number, y: number): boolean {
        if (x < 0 || x >= levelData.width || y < 0 || y >= levelData.height) {
          return true;
        }
        return levelData.walls[y][x];
      },
      isPositionSafe(x: number, y: number, width: number = 32, height: number = 32): boolean {
        const gridX1 = Math.floor(x / 32);
        const gridY1 = Math.floor(y / 32);
        const gridX2 = Math.floor((x + width - 1) / 32);
        const gridY2 = Math.floor((y + height - 1) / 32);
        
        for (let gridY = gridY1; gridY <= gridY2; gridY++) {
          for (let gridX = gridX1; gridX <= gridX2; gridX++) {
            if (this.isWall(gridX, gridY)) {
              return false;
            }
          }
        }
        return true;
      },
      getMapCenter() {
        const centerGridX = Math.floor(levelData.width / 2);
        const centerGridY = Math.floor(levelData.height / 2);
        return { x: centerGridX * 32, y: centerGridY * 32 };
      },
      getEdgeSpawnPositions() {
        const edgePositions: Array<{x: number, y: number}> = [];
        const gridSize = 32;
        
        // Top edge
        for (let x = 2; x < levelData.width - 2; x++) {
          const pixelX = x * gridSize;
          const pixelY = 1 * gridSize;
          if (this.isPositionSafe(pixelX, pixelY, 32, 32)) {
            edgePositions.push({ x: pixelX, y: pixelY });
          }
        }
        
        // Bottom edge
        for (let x = 2; x < levelData.width - 2; x++) {
          const pixelX = x * gridSize;
          const pixelY = (levelData.height - 2) * gridSize;
          if (this.isPositionSafe(pixelX, pixelY, 32, 32)) {
            edgePositions.push({ x: pixelX, y: pixelY });
          }
        }
        
        // Left edge
        for (let y = 2; y < levelData.height - 2; y++) {
          const pixelX = 1 * gridSize;
          const pixelY = y * gridSize;
          if (this.isPositionSafe(pixelX, pixelY, 32, 32)) {
            edgePositions.push({ x: pixelX, y: pixelY });
          }
        }
        
        // Right edge
        for (let y = 2; y < levelData.height - 2; y++) {
          const pixelX = (levelData.width - 2) * gridSize;
          const pixelY = y * gridSize;
          if (this.isPositionSafe(pixelX, pixelY, 32, 32)) {
            edgePositions.push({ x: pixelX, y: pixelY });
          }
        }
        
        return edgePositions;
      }
    };
    
    // Calculate enemy count based on level (3 to 25 enemies)
    const enemyCount = Math.min(3 + (index * 2), 25);
    
    // Generate edge spawns
    const edgePositions = tempLevel.getEdgeSpawnPositions();
    const playerCenter = tempLevel.getMapCenter();
    const enemyTypes = ['panther', 'primate', 'bear'] as const;
    const minDistanceFromPlayer = 128;
    
    // Filter positions that are far enough from player spawn
    const validPositions = edgePositions.filter(pos => {
      const distance = Math.sqrt(
        Math.pow(pos.x - playerCenter.x, 2) + 
        Math.pow(pos.y - playerCenter.y, 2)
      );
      return distance >= minDistanceFromPlayer;
    });
    
    const spawns: Array<{pos: {x: number, y: number}, type: 'panther' | 'primate' | 'bear'}> = [];
    const usedPositions = new Set<string>();
    
    for (let i = 0; i < enemyCount && spawns.length < validPositions.length; i++) {
      let attempts = 0;
      let selectedPosition: {x: number, y: number} | null = null;
      
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
    
    console.log(`Level ${index + 1}: Generated ${spawns.length} edge enemy spawns`);
    
    return {
      ...levelData,
      enemySpawns: spawns
    };
  });
}