import { LevelData, Vector2 } from './types';
import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE } from './constants';

interface ParsedLevel {
  walls: boolean[][];
  npcPositions: Vector2[];
  hutPositions: Vector2[];
}

// Parse an ASCII grid into walls + NPC/hut position lists.
// Tile chars: '#' = wall (tree), '.' = floor (dirt),
// 'N' = NPC marker (placeholder; treated as floor),
// 'H' = hut marker (placeholder; treated as floor).
function parseLevel(grid: string[]): ParsedLevel {
  if (grid.length !== GRID_HEIGHT) {
    throw new Error(`Level grid must have ${GRID_HEIGHT} rows; got ${grid.length}`);
  }
  const walls: boolean[][] = [];
  const npcPositions: Vector2[] = [];
  const hutPositions: Vector2[] = [];

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = grid[y];
    if (row.length !== GRID_WIDTH) {
      throw new Error(
        `Level row ${y} must have ${GRID_WIDTH} cols; got ${row.length} ("${row}")`
      );
    }
    walls[y] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      const ch = row[x];
      if (ch === '#') {
        walls[y][x] = true;
      } else if (ch === '.') {
        walls[y][x] = false;
      } else if (ch === 'N') {
        walls[y][x] = false;
        npcPositions.push({ x: x * TILE_SIZE, y: y * TILE_SIZE });
      } else if (ch === 'H') {
        walls[y][x] = false;
        hutPositions.push({ x: x * TILE_SIZE, y: y * TILE_SIZE });
      } else {
        throw new Error(
          `Unknown tile char "${ch}" at (${x},${y}) on row "${row}"`
        );
      }
    }
  }

  return { walls, npcPositions, hutPositions };
}

// Default player spawn: exact map center for a 29×17 grid.
// (col 14 × 32, row 8 × 32) = (448, 256)
const CENTER_SPAWN: Vector2 = { x: 448, y: 256 };

function buildLevel(grid: string[]): LevelData {
  const parsed = parseLevel(grid);
  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    walls: parsed.walls,
    playerSpawn: { ...CENTER_SPAWN },
    enemySpawns: [],
    npcPositions: parsed.npcPositions,
    hutPositions: parsed.hutPositions,
  };
}

export const levels: LevelData[] = [
  // Level 1 — L-shaped path through the forest
  buildLevel([
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '................#############',
    '................#############',
    '................#############',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ]),

  // Level 2 — T-shape: vertical entry meeting a horizontal corridor
  buildLevel([
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '.............................',
    '.............................',
    '.............................',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ]),

  // Level 3 — Plus/cross-shape: vertical full + horizontal full
  buildLevel([
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '.............................',
    '.............................',
    '.............................',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ]),

  // Level 4 — T-shape with hut
  buildLevel([
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#............................',
    '#.H..........................',
    '#............................',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ]),

  // Level 5 — Z/S-shape: upper corridor offset left, lower corridor offset right, hut in mid band
  buildLevel([
    '#########...#################',
    '#########...#################',
    '#########...#################',
    '#########...#################',
    '#########...#################',
    '#########...#################',
    '#########...#################',
    '#............................',
    '#.H..........................',
    '#............................',
    '#################...#########',
    '#################...#########',
    '#################...#########',
    '#################...#########',
    '#################...#########',
    '#################...#########',
    '#################...#########',
  ]),

  // Level 6 — Family + hut clustered in the middle band (T-shape)
  buildLevel([
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '.............................',
    '......N.N.H.N................',
    '.............................',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ]),

  // Level 7 — Single horizontal corridor with family scattered
  buildLevel([
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '.......N.............N.......',
    '.............................',
    '.......N.....................',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ]),

  // Level 8 — Plus/cross-shape with family in middle band
  buildLevel([
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '............N...N............',
    '.............................',
    '............N................',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ]),

  // Level 9 — Six vertical corridors meeting at a wide horizontal band
  buildLevel([
    '#####...#####...#####...#####',
    '#...#...#...#...#...#...#...#',
    '#...#...#...#...#...#...#...#',
    '#...#...#...#...#...#...#...#',
    '#...#...#...#...#...#...#...#',
    '#...#...#...#...#...#...#...#',
    '#####...#####...#####...#####',
    '.....N.N.....................',
    '.............................',
    '.....N.......................',
    '#####...#####...#####...#####',
    '#...#...#...#...#...#...#...#',
    '#...#...#...#...#...#...#...#',
    '#...#...#...#...#...#...#...#',
    '#...#...#...#...#...#...#...#',
    '#...#...#...#...#...#...#...#',
    '#####...#####...#####...#####',
  ]),

  // Level 10 — Boss arena: outer wall ring, all interior floor
  buildLevel([
    '#############################',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#...........................#',
    '#############################',
  ]),
];

// Generate enemy spawns for each level at runtime.
// Spawn count scales with level: 3 + index*2, capped at 25.
// Spawns drawn from the inner perimeter ring; positions further than
// 128px from the player center are considered.
export function initializeLevels(): LevelData[] {
  return levels.map((levelData, index) => {
    const tempLevel = {
      isWall(x: number, y: number): boolean {
        if (x < 0 || x >= levelData.width || y < 0 || y >= levelData.height) {
          return true;
        }
        return levelData.walls[y][x];
      },
      isPositionSafe(x: number, y: number, w = TILE_SIZE, h = TILE_SIZE): boolean {
        const gx1 = Math.floor(x / TILE_SIZE);
        const gy1 = Math.floor(y / TILE_SIZE);
        const gx2 = Math.floor((x + w - 1) / TILE_SIZE);
        const gy2 = Math.floor((y + h - 1) / TILE_SIZE);
        for (let gy = gy1; gy <= gy2; gy++) {
          for (let gx = gx1; gx <= gx2; gx++) {
            if (this.isWall(gx, gy)) return false;
          }
        }
        return true;
      },
      getMapCenter(): Vector2 {
        return {
          x: Math.floor(levelData.width / 2) * TILE_SIZE,
          y: Math.floor(levelData.height / 2) * TILE_SIZE,
        };
      },
      getEdgeSpawnPositions(): Vector2[] {
        const out: Vector2[] = [];
        // Top + bottom edges (skip corners)
        for (let x = 2; x < levelData.width - 2; x++) {
          const px = x * TILE_SIZE;
          if (this.isPositionSafe(px, 1 * TILE_SIZE)) {
            out.push({ x: px, y: 1 * TILE_SIZE });
          }
          if (this.isPositionSafe(px, (levelData.height - 2) * TILE_SIZE)) {
            out.push({ x: px, y: (levelData.height - 2) * TILE_SIZE });
          }
        }
        // Left + right edges (skip corners)
        for (let y = 2; y < levelData.height - 2; y++) {
          const py = y * TILE_SIZE;
          if (this.isPositionSafe(1 * TILE_SIZE, py)) {
            out.push({ x: 1 * TILE_SIZE, y: py });
          }
          if (this.isPositionSafe((levelData.width - 2) * TILE_SIZE, py)) {
            out.push({ x: (levelData.width - 2) * TILE_SIZE, y: py });
          }
        }
        return out;
      },
    };

    const enemyCount = Math.min(3 + index * 2, 25);
    const playerCenter = tempLevel.getMapCenter();
    const enemyTypes = ['panther', 'primate', 'bear'] as const;
    const minDistanceFromPlayer = 128;

    const validPositions = tempLevel
      .getEdgeSpawnPositions()
      .filter((pos) => {
        const dx = pos.x - playerCenter.x;
        const dy = pos.y - playerCenter.y;
        return Math.sqrt(dx * dx + dy * dy) >= minDistanceFromPlayer;
      });

    const spawns: Array<{
      pos: Vector2;
      type: 'panther' | 'primate' | 'bear';
    }> = [];
    const usedPositions = new Set<string>();

    for (
      let i = 0;
      i < enemyCount && spawns.length < validPositions.length;
      i++
    ) {
      let attempts = 0;
      let selected: Vector2 | null = null;
      while (attempts < 50 && !selected) {
        const candidate =
          validPositions[Math.floor(Math.random() * validPositions.length)];
        const key = `${candidate.x},${candidate.y}`;
        if (!usedPositions.has(key)) {
          selected = candidate;
          usedPositions.add(key);
        }
        attempts++;
      }
      if (selected) {
        spawns.push({
          pos: { ...selected },
          type: enemyTypes[Math.floor(Math.random() * enemyTypes.length)],
        });
      }
    }

    return {
      ...levelData,
      enemySpawns: spawns,
    };
  });
}
