import {
  BandSpec,
  LevelData,
  LevelWaveConfig,
  SpawnTemplate,
  Vector2,
  DelayedSpawnConfig,
} from './types';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_WIDTH,
  GRID_HEIGHT,
  TILE_SIZE,
  DEFAULT_INTER_WAVE_LULL_MS,
} from './constants';

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
    throw new Error(
      `Level grid must have ${GRID_HEIGHT} rows; got ${grid.length}`,
    );
  }
  const walls: boolean[][] = [];
  const npcPositions: Vector2[] = [];
  const hutPositions: Vector2[] = [];

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = grid[y];
    if (row.length !== GRID_WIDTH) {
      throw new Error(
        `Level row ${y} must have ${GRID_WIDTH} cols; got ${row.length} ("${row}")`,
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
          `Unknown tile char "${ch}" at (${x},${y}) on row "${row}"`,
        );
      }
    }
  }

  return { walls, npcPositions, hutPositions };
}

// Default player spawn: exact map center for a 29×17 grid.
// (col 14 × 32, row 8 × 32) = (448, 256)
const CENTER_SPAWN: Vector2 = { x: 448, y: 256 };

interface BuildLevelOptions {
  delayedSpawns?: DelayedSpawnConfig;
  waveConfig?: LevelWaveConfig;
}

function buildLevel(grid: string[], opts: BuildLevelOptions = {}): LevelData {
  const parsed = parseLevel(grid);
  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    walls: parsed.walls,
    playerSpawn: { ...CENTER_SPAWN },
    enemySpawns: [],
    npcPositions: parsed.npcPositions,
    hutPositions: parsed.hutPositions,
    delayedSpawns: opts.delayedSpawns,
    waveConfig: opts.waveConfig,
  };
}

// Spawn bands sit one tile outside the canvas. Each is 3 tiles wide along
// its band axis × 1 tile deep along the entry axis. `entryDirection`
// points inward — group rows beyond the front row stack at one-tile
// spacing in the reverse direction.
const TOP_BAND: BandSpec = {
  rect: {
    x: 13 * TILE_SIZE,
    y: -TILE_SIZE,
    width: 3 * TILE_SIZE,
    height: TILE_SIZE,
  },
  entryDirection: { x: 0, y: 1 },
};
const BOTTOM_BAND: BandSpec = {
  rect: {
    x: 13 * TILE_SIZE,
    y: CANVAS_HEIGHT,
    width: 3 * TILE_SIZE,
    height: TILE_SIZE,
  },
  entryDirection: { x: 0, y: -1 },
};
const LEFT_BAND: BandSpec = {
  rect: {
    x: -TILE_SIZE,
    y: 7 * TILE_SIZE,
    width: TILE_SIZE,
    height: 3 * TILE_SIZE,
  },
  entryDirection: { x: 1, y: 0 },
};
const RIGHT_BAND: BandSpec = {
  rect: {
    x: CANVAS_WIDTH,
    y: 7 * TILE_SIZE,
    width: TILE_SIZE,
    height: 3 * TILE_SIZE,
  },
  entryDirection: { x: -1, y: 0 },
};
// L1's top entryway is offset right (cols 20-22) rather than centered.
const L1_TOP_BAND: BandSpec = {
  rect: {
    x: 20 * TILE_SIZE,
    y: -TILE_SIZE,
    width: 3 * TILE_SIZE,
    height: TILE_SIZE,
  },
  entryDirection: { x: 0, y: 1 },
};

// 8 pre-designed templates. Each `rows[i]` is the ordered list of enemies
// entering together in row i; row 0 enters first and trailing rows arrive
// at the leading row's clearance cadence (one tile at the row's slowest
// unit speed). Within a row, enemies pack left-justified by cumulative AABB
// width (Step 1: a uniform TILE_SIZE per type). See ROADMAP §5.6.
//
// NOTE (intentional): the old `cells` grid encoded position by column, so
// null gaps centered/spread a row across the 3-tile band (e.g. a lone
// panther sat in the middle column). The new `rows` shape packs from the
// band's start, so for the 5 templates that had gaps the in-band entry
// position shifts by ≤1 tile. This is the mandated §5.6 packing and also
// affects the legacy (USE_GLOBAL_WAVE_SCHEDULER=false) path, which shares
// these templates. It changes only sub-tile entry positions — never counts,
// types, timing, cadence, or wall-safety (packed rows of ≤3 stay inside the
// 3-tile corridor bands). The legacy path is removed in Step 3.
const T_1PANTHER: SpawnTemplate = {
  id: 'g-1panther',
  rows: [['panther']],
};
const T_2PANTHER: SpawnTemplate = {
  id: 'g-2panther',
  rows: [['panther', 'panther']],
};
const T_1PANTHER_6SNAKE: SpawnTemplate = {
  id: 'g-1panther-6snake',
  rows: [
    ['panther'],
    ['snake', 'snake'],
    ['snake', 'snake'],
    ['snake', 'snake'],
  ],
};
const T_3SNAKE: SpawnTemplate = {
  id: 'g-3snake',
  rows: [['snake', 'snake', 'snake']],
};
const T_6SNAKE: SpawnTemplate = {
  id: 'g-6snake',
  rows: [
    ['snake', 'snake', 'snake'],
    ['snake', 'snake', 'snake'],
  ],
};
const T_9SNAKE: SpawnTemplate = {
  id: 'g-9snake',
  rows: [
    ['snake', 'snake', 'snake'],
    ['snake', 'snake', 'snake'],
    ['snake', 'snake', 'snake'],
  ],
};
const T_12SNAKE: SpawnTemplate = {
  id: 'g-12snake',
  rows: [
    ['snake', 'snake', 'snake'],
    ['snake', 'snake', 'snake'],
    ['snake', 'snake', 'snake'],
    ['snake', 'snake', 'snake'],
  ],
};
const T_1BEAR: SpawnTemplate = {
  id: 'g-1bear',
  rows: [['bear']],
};
const T_1BEAR_4SNAKE: SpawnTemplate = {
  id: 'g-1bear-4snake',
  rows: [['bear'], ['snake', 'snake'], ['snake', 'snake']],
};
const T_2PANTHER_1BEAR: SpawnTemplate = {
  id: 'g-2panther-1bear',
  rows: [['panther', 'bear', 'panther']],
};

// Type-gated group pools. SNAKE_PANTHER_POOL has no bears; SNAKE_PANTHER_BEAR_POOL
// adds the bear groups. These remain the pools for the legacy per-level
// LevelData (L1 uses snake+panther, L2/L3 add bears); the global scheduler now
// uses the wave-tiered pools below instead.
export const SNAKE_PANTHER_POOL: SpawnTemplate[] = [
  T_1PANTHER,
  T_2PANTHER,
  T_1PANTHER_6SNAKE,
  T_9SNAKE,
  T_12SNAKE,
];
export const SNAKE_PANTHER_BEAR_POOL: SpawnTemplate[] = [
  ...SNAKE_PANTHER_POOL,
  T_1BEAR,
  T_1BEAR_4SNAKE,
  T_2PANTHER_1BEAR,
];

// Wave-tiered group pools for the GlobalWaveScheduler. It selects by global
// wave number (constants WAVE_POOL_MID_UNLOCK / WAVE_POOL_LATE_UNLOCK):
//   waves 1–4  : EARLY  — 3-snake, 6-snake, 1-panther only
//   waves 5–8  : MID    — adds 2-panther, 1-panther+6-snake, 9-snake
//   waves 9+   : LATE   — adds 1-bear, 12-snake (bears unlock here)
export const WAVE_POOL_EARLY: SpawnTemplate[] = [
  T_3SNAKE,
  T_6SNAKE,
  T_1PANTHER,
];
export const WAVE_POOL_MID: SpawnTemplate[] = [
  ...WAVE_POOL_EARLY,
  T_2PANTHER,
  T_1PANTHER_6SNAKE,
  T_9SNAKE,
];
export const WAVE_POOL_LATE: SpawnTemplate[] = [
  ...WAVE_POOL_MID,
  T_1BEAR,
  T_12SNAKE,
];

// L1 wave 1's very first draw is restricted to a 2-option mini-pool so
// the player always opens on a readable threat shape.
const L1_W1_FIRST_SPAWN_POOL: SpawnTemplate[] = [T_1PANTHER, T_1PANTHER_6SNAKE];

// Level 1 — single top band, offset right over cols 20-22. Setup → add
// → test cadence; budgets are soft caps (last group may overshoot).
const L1_WAVE_CONFIG: LevelWaveConfig = {
  interWaveLullMs: DEFAULT_INTER_WAVE_LULL_MS,
  bands: [L1_TOP_BAND],
  groupPool: SNAKE_PANTHER_POOL,
  waves: [
    {
      id: 'l1-w1-setup',
      beatRole: 'setup',
      enemyCount: 10,
      spawnIntervalMs: 2500,
      firstSpawnPool: L1_W1_FIRST_SPAWN_POOL,
    },
    {
      id: 'l1-w2-add',
      beatRole: 'add',
      enemyCount: 14,
      spawnIntervalMs: 2000,
    },
    {
      id: 'l1-w3-test',
      beatRole: 'test',
      enemyCount: 20,
      spawnIntervalMs: 1500,
    },
  ],
};

// Level 2 — top + left + right bands (T-shape; bottom is closed).
const L2_WAVE_CONFIG: LevelWaveConfig = {
  interWaveLullMs: DEFAULT_INTER_WAVE_LULL_MS,
  bands: [TOP_BAND, LEFT_BAND, RIGHT_BAND],
  groupPool: SNAKE_PANTHER_BEAR_POOL,
  waves: [
    {
      id: 'l2-w1-setup',
      beatRole: 'setup',
      enemyCount: 14,
      spawnIntervalMs: 2000,
    },
    {
      id: 'l2-w2-add',
      beatRole: 'add',
      enemyCount: 20,
      spawnIntervalMs: 1700,
    },
    {
      id: 'l2-w3-test',
      beatRole: 'test',
      enemyCount: 26,
      spawnIntervalMs: 1400,
    },
  ],
};

// Level 3 — all four bands (cross-shape).
const L3_WAVE_CONFIG: LevelWaveConfig = {
  interWaveLullMs: DEFAULT_INTER_WAVE_LULL_MS,
  bands: [TOP_BAND, BOTTOM_BAND, LEFT_BAND, RIGHT_BAND],
  groupPool: SNAKE_PANTHER_BEAR_POOL,
  waves: [
    {
      id: 'l3-w1-setup',
      beatRole: 'setup',
      enemyCount: 16,
      spawnIntervalMs: 1700,
    },
    {
      id: 'l3-w2-add',
      beatRole: 'add',
      enemyCount: 22,
      spawnIntervalMs: 1400,
    },
    {
      id: 'l3-w3-test',
      beatRole: 'test',
      enemyCount: 28,
      spawnIntervalMs: 1300,
    },
  ],
};

export const levels: LevelData[] = [
  // Level 1 — L-shaped path. Wave-driven trickle from the right-offset
  // top entryway at cols 20-22 (see L1_WAVE_CONFIG).
  buildLevel(
    [
      '####################...######',
      '####################...######',
      '####################...######',
      '####################...######',
      '####################...######',
      '####################...######',
      '####################...######',
      '.......................######',
      '.......................######',
      '.......................######',
      '#############################',
      '#############################',
      '#############################',
      '#############################',
      '#############################',
      '#############################',
      '#############################',
    ],
    { waveConfig: L1_WAVE_CONFIG },
  ),

  // Level 2 — T-shape: vertical entry meeting a horizontal corridor.
  // Wave-driven from the level perimeter (see L2_WAVE_CONFIG).
  buildLevel(
    [
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
    ],
    { waveConfig: L2_WAVE_CONFIG },
  ),

  // Level 3 — Plus/cross-shape: vertical full + horizontal full.
  // Wave-driven from the level perimeter (see L3_WAVE_CONFIG).
  buildLevel(
    [
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
    ],
    { waveConfig: L3_WAVE_CONFIG },
  ),

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
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '.....N.N.....................',
    '.............................',
    '.....N.......................',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
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
    // Levels with delayed-spawn entryways don't use the perimeter spawner;
    // their enemies are scheduled at runtime by Game.startLevel().
    if (levelData.delayedSpawns) {
      return levelData;
    }
    const tempLevel = {
      isWall(x: number, y: number): boolean {
        if (x < 0 || x >= levelData.width || y < 0 || y >= levelData.height) {
          return true;
        }
        return levelData.walls[y][x];
      },
      isPositionSafe(
        x: number,
        y: number,
        w = TILE_SIZE,
        h = TILE_SIZE,
      ): boolean {
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
    const enemyTypes = ['panther', 'snake', 'gibbon', 'bear'] as const;
    const minDistanceFromPlayer = 128;

    const validPositions = tempLevel.getEdgeSpawnPositions().filter((pos) => {
      const dx = pos.x - playerCenter.x;
      const dy = pos.y - playerCenter.y;
      return Math.sqrt(dx * dx + dy * dy) >= minDistanceFromPlayer;
    });

    const spawns: Array<{
      pos: Vector2;
      type: 'panther' | 'snake' | 'gibbon' | 'bear';
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
