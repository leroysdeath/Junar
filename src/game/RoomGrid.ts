// Room-grid generator for the traversable-maps refactor (Step 3).
//
// A run is a ROOM_GRID_COLS × ROOM_GRID_ROWS grid of rooms (493 total),
// regenerated every run. REQUIRED_ROOM_COUNT (11) cells are guaranteed each run
// — the start (a random L-bend), the boss arena (one of four versions), the four
// mini-boss arenas, and five mango dead-ends; the rest are connectors drawn from
// CONNECTOR_TEMPLATE_POOL (which now also carries the demoted anchor-1/-5/-9
// layouts). The player traverses room-to-room from the start toward the boss.
// See docs/ROADMAP-traversable-maps.md §5.1 (run structure), §5.2 (templates),
// §5.3 (transitions).
//
// Generation pipeline (generateRunMap):
//   1. Poisson-disk place the 11 required rooms in the INNER interior (≥
//      MIN_ANCHOR_SPACING apart; two rings off the border so even a single-
//      opening room's door faces a fully-connectable interior neighbour), then
//      assign roles (farthest-from-start = boss; rest split mini-boss / mango).
//   2. Fill every other cell with a connector whose openings are compatible with
//      already-placed neighbors and the grid border.
//   3. BFS path-existence from the start; if any required room is unreachable,
//      regenerate.
//
// ── Adjacency model (a pragmatic reading of §5.3) ───────────────────────────
// Two adjacent CONNECTORS must have IDENTICAL opening sets on their shared edge
// (a clean, gap-free corridor fabric). ANCHORS, however, are the existing level
// layouts whose edge openings are NOT authored to canonical connector positions
// (e.g. L1's top opening sits at cols 20–22, not the connector centre 13–15), so
// a connector can't always mirror them exactly. Anchors therefore connect
// PERMISSIVELY: a passage between any two adjacent rooms exists wherever their
// openings on the shared edge OVERLAP. Connector selection biases toward
// connecting adjacent anchors, and the BFS path-existence check (overlap-based)
// guarantees the boss is reachable or the map regenerates. Transitions at
// runtime use the same overlap rule (see roomsConnect / openingsOnEdge).

import {
  Edge,
  RoomDef,
  RoomGridCoord,
  RoomOpening,
  RunMap,
  Vector2,
} from './types';
import {
  ROOM_GRID_COLS,
  ROOM_GRID_ROWS,
  MINIBOSS_COUNT,
  MANGO_RUN_CAP,
  MIN_ANCHOR_SPACING,
  GRID_WIDTH,
  GRID_HEIGHT,
  TILE_SIZE,
} from './constants';
import { levels } from './levels';
import { CONNECTOR_TEMPLATE_POOL, deriveOpenings } from './RoomTemplates';

// ───────────────────────────────────────────────────────────────────────────
// Seeded PRNG (mulberry32). A numeric seed gives reproducible maps (used by the
// generation tests / ASCII harness); Math.random seeds it when none is given.
// This is map *layout* randomness, not gameLoop simulation timing, so it never
// touches Date.now (Invariant 8 is about sim timing only).
// ───────────────────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng: () => number, n: number): number => Math.floor(rng() * n);

// ───────────────────────────────────────────────────────────────────────────
// Edge / opening helpers (exported — Game.ts uses them for transitions, BFS
// uses them for connectivity).
// ───────────────────────────────────────────────────────────────────────────

export function oppositeEdge(edge: Edge): Edge {
  return edge === 'N' ? 'S' : edge === 'S' ? 'N' : edge === 'E' ? 'W' : 'E';
}

export function openingsOnEdge(def: RoomDef, edge: Edge): RoomOpening[] {
  return def.openings.filter((o) => o.edge === edge);
}

export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

// True if room A's `edge` openings overlap room B's opposite-edge openings —
// i.e. the player can physically cross between A and B at that border. Symmetric
// by construction (it requires both sides open at a shared position).
export function roomsConnect(a: RoomDef, edge: Edge, b: RoomDef): boolean {
  const bOpenings = openingsOnEdge(b, oppositeEdge(edge));
  for (const x of openingsOnEdge(a, edge)) {
    for (const y of bOpenings) {
      if (rangesOverlap(x.rangeStart, x.rangeEnd, y.rangeStart, y.rangeEnd)) {
        return true;
      }
    }
  }
  return false;
}

function edgeClosed(def: RoomDef, edge: Edge): boolean {
  return openingsOnEdge(def, edge).length === 0;
}

// Set-equality of the two edges' opening ranges (used only between connectors).
function edgeOpeningsEqual(
  a: RoomDef,
  ae: Edge,
  b: RoomDef,
  be: Edge,
): boolean {
  const key = (def: RoomDef, e: Edge) =>
    openingsOnEdge(def, e)
      .map((o) => `${o.rangeStart}-${o.rangeEnd}`)
      .sort()
      .join(',');
  return key(a, ae) === key(b, be);
}

const manhattan = (a: RoomGridCoord, b: RoomGridCoord): number =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

// Edge + its grid-delta. Order is stable so map generation is deterministic
// given a seed.
const DIRS: ReadonlyArray<readonly [Edge, number, number]> = [
  ['N', 0, -1],
  ['S', 0, 1],
  ['W', -1, 0],
  ['E', 1, 0],
];

// ───────────────────────────────────────────────────────────────────────────
// Room definitions, built once at module load.
// ───────────────────────────────────────────────────────────────────────────

// Canonical doorway positions, matching the connector convention so anchors
// mesh with the connector fabric: N/S doors span the centre 3 columns, E/W
// doors the centre 3 rows.
const MID_COL = Math.floor(GRID_WIDTH / 2);
const MID_ROW = Math.floor(GRID_HEIGHT / 2);
const DOOR_COLS = [MID_COL - 1, MID_COL, MID_COL + 1]; // 13,14,15
const DOOR_ROWS = [MID_ROW - 1, MID_ROW, MID_ROW + 1]; // 7,8,9

// Carve a straight tunnel from an edge tile inward (stepping dx,dy) through any
// wall until it meets existing floor — so a carved doorway always connects to
// the room interior rather than opening a 1-tile pocket.
function carveTunnel(
  walls: boolean[][],
  col: number,
  row: number,
  dx: number,
  dy: number,
): void {
  let c = col;
  let r = row;
  while (c >= 0 && r >= 0 && c < GRID_WIDTH && r < GRID_HEIGHT) {
    if (!walls[r][c]) break; // reached interior floor — connected
    walls[r][c] = false; // carve this wall tile
    c += dx;
    r += dy;
  }
}

// The anchor levels were authored as standalone arenas, several with solid
// perimeters (the boss arena, anchor 10, is fully sealed). To make them
// traversable rooms in the grid, carve a canonical doorway into each of the 4
// edges (tunneling to the interior). The hand-authored interior is preserved;
// only the four entrances are added. Operates on a deep copy — levels.ts data
// is never mutated. Refined, hand-authored anchor doors are a future step.
function carveAnchorDoors(src: boolean[][]): boolean[][] {
  const walls = src.map((row) => row.slice());
  for (const col of DOOR_COLS) {
    carveTunnel(walls, col, 0, 0, 1); // N edge → down
    carveTunnel(walls, col, GRID_HEIGHT - 1, 0, -1); // S edge → up
  }
  for (const row of DOOR_ROWS) {
    carveTunnel(walls, 0, row, 1, 0); // W edge → right
    carveTunnel(walls, GRID_WIDTH - 1, row, -1, 0); // E edge → left
  }
  return walls;
}

// anchor-1 / -5 / -9 demoted to CONNECTORS (owner 2026-06-20): only the boss
// (anchor-10, now its own four-version registry below) remains a required
// hand-authored room. Their canonical carved doorways (cross-like, all four
// edges) make them ordinary corridor fabric — big rooms the player passes
// through. NPC/hut markers are STRIPPED here: connector defs are shared by
// reference across many cells, so keeping the markers would duplicate the
// family across the map. Family rendering is paused until the FamilyMember
// entity lands and re-places them (CLAUDE.md §6).
const ANCHOR_CONNECTOR_LEVEL_INDICES = [0, 4, 8]; // levels.ts: anchor-1, -5, -9
const ANCHOR_CONNECTOR_DEFS: RoomDef[] = ANCHOR_CONNECTOR_LEVEL_INDICES.map(
  (lvlIdx) => {
    const walls = carveAnchorDoors(levels[lvlIdx].walls);
    return {
      kind: 'connector' as const,
      templateId: `anchor-${lvlIdx + 1}`,
      anchorIndex: null,
      walls,
      openings: deriveOpenings(walls),
      candidates: [],
      authoredStatics: [],
      npcPositions: [],
      hutPositions: [],
    };
  },
);

// The connector pool as RoomDefs. Shared by reference across every cell that
// uses the same template — they're read-only, so no per-cell copy is needed.
// The demoted anchor rooms (above) ride along in the same pool.
const CONNECTOR_DEFS: RoomDef[] = [
  ...CONNECTOR_TEMPLATE_POOL.map((t) => ({
    kind: 'connector' as const,
    templateId: t.id,
    anchorIndex: null,
    walls: t.walls,
    openings: t.openings,
    candidates: t.candidates,
    authoredStatics: t.authoredStatics,
    npcPositions: [],
    hutPositions: [],
  })),
  ...ANCHOR_CONNECTOR_DEFS,
];

// Mini-boss arena templates (owner 2026-06-20). Hand-authored 29×17 arenas
// ('#' = tree wall, '.' = dirt floor). Openings are authored into each grid and
// derived from geometry (no door-carving — each room keeps its exact silhouette),
// connecting to the corridor fabric via opening OVERLAP like anchors.
//
// Of the four mini-boss rooms a run places, ONE (the panther arena, farthest from
// start) spawns the coded enlarged-panther boss; the other three are EMPTY themed
// rooms whose minibosses are documented ideas, not yet built (docs/IDEATION.md).
// Each `active` slot has an `alt` kept here as a ready swap-in.
//
//   panther → emptyThrone (active) | motherStump (alt — centre is a WALL, so
//             swapping it in needs an off-centre boss spawn; boss spawns at the
//             centre CENTER_SPAWN today)
//   empty   → bear (active) | bearAlt; snake (active) | snakeAlt, snakeAlt2; gibbon
//
// NOTE (connectivity): the bear arena uses the standard canonical doorways
// (N/S 13-15, E/W 7-9). The snake arena's openings are non-canonical (corner
// offsets) and the gibbon arena opens only N/S — both still overlap the connector
// fabric on the analysed edges, so they connect, just not on the canonical centre.
// The all-mini-boss-reachable gate in generateRunMap regenerates any map where a
// room is stranded, so connectivity is guaranteed; see notes for the door-carving
// fallback if a future map proves hard to connect.
const MINIBOSS_ARENAS = {
  // The panther Empty Throne — the former t-maze-cross-pillars connector,
  // promoted here (owner 2026-06-20) and removed from the connector pool. Four
  // corner tree-blocks frame an open centre + cross; canonical doorways; centre
  // tile open so the boss spawns at CENTER_SPAWN.
  emptyThrone: {
    id: 'miniboss-empty-throne',
    ascii: [
      '#############...#############',
      '#...........................#',
      '#...######.........######...#',
      '#...######.........######...#',
      '#...######.........######...#',
      '#...######.........######...#',
      '#...........................#',
      '.............................',
      '.............................',
      '.............................',
      '#...........................#',
      '#...######.........######...#',
      '#...######.........######...#',
      '#...######.........######...#',
      '#...######.........######...#',
      '#...........................#',
      '#############...#############',
    ],
  },
  // Previous Empty Throne design (four 5×3 corner tree-stands) — saved alt.
  emptyThroneAlt: {
    id: 'miniboss-empty-throne-v1',
    ascii: [
      '#############...#############',
      '#...........................#',
      '#...........................#',
      '#....#####.........#####....#',
      '#....#####.........#####....#',
      '#....#####.........#####....#',
      '#...........................#',
      '.............................',
      '.............................',
      '.............................',
      '#...........................#',
      '#....#####.........#####....#',
      '#....#####.........#####....#',
      '#....#####.........#####....#',
      '#...........................#',
      '#...........................#',
      '#############...#############',
    ],
  },
  motherStump: {
    id: 'miniboss-mother-stump',
    ascii: [
      '#############...#############',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '............#####............',
      '............#####............',
      '............#####............',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '#############...#############',
    ],
  },
  bear: {
    id: 'miniboss-bear',
    ascii: [
      '#############...#############',
      '#####...................#####',
      '##.........................##',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '.............................',
      '.............................',
      '.............................',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '#...........................#',
      '##.........................##',
      '#####...................#####',
      '#############...#############',
    ],
  },
  bearAlt: {
    id: 'miniboss-bear-octagon',
    ascii: [
      '#######...............#######',
      '#####...................#####',
      '##.........................##',
      '#...........................#',
      '.............................',
      '.............................',
      '.............................',
      '.............................',
      '.............................',
      '.............................',
      '.............................',
      '.............................',
      '.............................',
      '#...........................#',
      '##.........................##',
      '#####...................#####',
      '#######...............#######',
    ],
  },
  snake: {
    id: 'miniboss-snake',
    ascii: [
      '######...###########...######',
      '.######......###......######.',
      '..#####...............#####..',
      '...#####.............#####...',
      '#....####...........####....#',
      '#......##...........##......#',
      '#.......##.........##.......#',
      '#...........................#',
      '##.........................##',
      '.###.....................###.',
      '...###.................###...',
      '.....###.............###.....',
      '#......##...........##......#',
      '#.............#.............#',
      '###...........#...........###',
      '####..........#..........####',
      '#####...#############...#####',
    ],
  },
  snakeAlt: {
    id: 'miniboss-snake-v1',
    ascii: [
      '######......#####......######',
      '.######......###......######.',
      '..#####...............#####..',
      '...#####.............#####...',
      '.....####...........####.....',
      '.......##...........##.......',
      '........##.........##........',
      '.............................',
      '##.........................##',
      '.###.....................###.',
      '...###.................###...',
      '.....###.............###.....',
      '.......##...........##.......',
      '..............#..............',
      '###...........#...........###',
      '####..........#..........####',
      '#####........###........#####',
    ],
  },
  // Snake alt 2 — same diamond/star silhouette but with clean CANONICAL doorways
  // (N/S 13-15, E/W 7-9), so it connects on the standard 3-wide entries. Best-
  // connecting snake design; a candidate to promote to the active `snake` slot.
  snakeAlt2: {
    id: 'miniboss-snake-v2',
    ascii: [
      '#############...#############',
      '#######...............#######',
      '#.#####......###......#####.#',
      '#..#####.............#####..#',
      '#....####...........####....#',
      '#......##...........##......#',
      '#.......##.........##.......#',
      '..#.......................#..',
      '..#.......................#..',
      '..##.....................##..',
      '#..###.................###..#',
      '#....###.............###....#',
      '#......##...........##......#',
      '#............###............#',
      '###...........#...........###',
      '####.....................####',
      '#############...#############',
    ],
  },
  gibbon: {
    id: 'miniboss-gibbon',
    ascii: [
      '#...#########...#############',
      '#.........###...###.........#',
      '#.........###...###.........#',
      '#.........###...###.........#',
      '#######...###...###...###...#',
      '#######...###...###...###...#',
      '#######...###...###...###...#',
      '#...............###...###...#',
      '#...............###...###...#',
      '#...............###...###...#',
      '#...#########...###...#######',
      '#...#########...###...#######',
      '#...#########...###...#######',
      '#.........###...............#',
      '#.........###...............#',
      '#.........###...............#',
      '#############...#########...#',
    ],
  },
} as const;

// Active arenas. The panther arena (the only one with a coded boss) uses
// emptyThrone; the three empty rooms use the bear/snake/gibbon designs.
const PANTHER_ARENA = MINIBOSS_ARENAS.emptyThrone;
const EMPTY_ARENAS = [
  MINIBOSS_ARENAS.bear,
  MINIBOSS_ARENAS.snake,
  MINIBOSS_ARENAS.gibbon,
];

// Build a mini-boss RoomDef from an authored arena: walls straight from the ASCII,
// openings derived from geometry. Shared by reference (read-only).
function buildMinibossDef(arena: {
  id: string;
  ascii: readonly string[];
}): RoomDef {
  const walls = arena.ascii.map((row) => [...row].map((ch) => ch === '#'));
  return {
    kind: 'miniboss',
    templateId: arena.id,
    anchorIndex: null,
    walls,
    openings: deriveOpenings(walls),
    candidates: [],
    authoredStatics: [],
    npcPositions: [],
    hutPositions: [],
  };
}
const PANTHER_DEF = buildMinibossDef(PANTHER_ARENA);
const EMPTY_DEFS = EMPTY_ARENAS.map(buildMinibossDef);

// ───────────────────────────────────────────────────────────────────────────
// Boss arena (anchor-10) — four versions (owner 2026-06-20).
// ───────────────────────────────────────────────────────────────────────────
// Each is a wide-open arena ringed by border trees with EXACTLY ONE canonical
// doorway and a solid 3×3 tree "stump" at the FAR end (M = its centre tile).
// Touching the stump wins the run (Game.isTouchingGrowthHeart vs
// RunMap.bossStumpCenter). One version is picked at random per run. The single
// opening is why the boss is placed inner-interior (placeRequired) — its door
// always faces a fully-connectable interior neighbour.
interface BossVersion {
  def: RoomDef;
  stumpCenter: Vector2;
}
function buildBossVersion(
  id: string,
  door: Edge,
  stumpCol: number,
  stumpRow: number,
): BossVersion {
  const lastRow = GRID_HEIGHT - 1;
  const lastCol = GRID_WIDTH - 1;
  // Open arena: solid border ring, floor interior.
  const walls: boolean[][] = Array.from({ length: GRID_HEIGHT }, (_, r) =>
    Array.from(
      { length: GRID_WIDTH },
      (_, c) => r === 0 || r === lastRow || c === 0 || c === lastCol,
    ),
  );
  // Carve the one canonical doorway (N/S cols 13-15, E/W rows 7-9).
  for (const col of DOOR_COLS) {
    if (door === 'N') walls[0][col] = false;
    if (door === 'S') walls[lastRow][col] = false;
  }
  for (const row of DOOR_ROWS) {
    if (door === 'W') walls[row][0] = false;
    if (door === 'E') walls[row][lastCol] = false;
  }
  // Stamp the solid 3×3 stump centred on (stumpCol, stumpRow).
  for (let r = stumpRow - 1; r <= stumpRow + 1; r++) {
    for (let c = stumpCol - 1; c <= stumpCol + 1; c++) {
      walls[r][c] = true;
    }
  }
  return {
    def: {
      kind: 'anchor',
      templateId: id,
      anchorIndex: null,
      walls,
      openings: deriveOpenings(walls),
      candidates: [],
      authoredStatics: [],
      npcPositions: [],
      hutPositions: [],
    },
    stumpCenter: {
      x: stumpCol * TILE_SIZE + TILE_SIZE / 2,
      y: stumpRow * TILE_SIZE + TILE_SIZE / 2,
    },
  };
}
// Door at one end, stump at the FAR end. Stump centres (px): v1 (464,112),
// v2 (464,432), v3 (816,272), v4 (112,272).
const BOSS_VERSIONS: BossVersion[] = [
  buildBossVersion('boss-v1', 'S', 14, 3),
  buildBossVersion('boss-v2', 'N', 14, 13),
  buildBossVersion('boss-v3', 'W', 25, 8),
  buildBossVersion('boss-v4', 'E', 3, 8),
];

// Required connector-layout rooms placed as guaranteed cells: the start L-bend
// (one of four rotations, random per run) and the five mango dead-ends (random
// rotations). Built kind:'anchor' so the connector fill biases toward wiring
// them in (anchorAgreement) and the reachability gate stays cheap. Statics are
// suppressed (candidates [] — required rooms stay clean).
function requiredFromTemplate(id: string): RoomDef {
  const t = CONNECTOR_TEMPLATE_POOL.find((x) => x.id === id);
  if (!t) throw new Error(`[Junar] required template not found: ${id}`);
  return {
    kind: 'anchor',
    templateId: t.id,
    anchorIndex: null,
    walls: t.walls,
    openings: t.openings,
    candidates: [],
    authoredStatics: [],
    npcPositions: [],
    hutPositions: [],
  };
}
const START_LBEND_DEFS: RoomDef[] = [
  't-lbend-ne',
  't-lbend-nw',
  't-lbend-se',
  't-lbend-sw',
].map(requiredFromTemplate);
const MANGO_DEADEND_DEFS: RoomDef[] = [
  't-deadend-n',
  't-deadend-s',
  't-deadend-e',
  't-deadend-w',
].map(requiredFromTemplate);

// Required rooms per run: start L-bend + boss + mini-bosses + mango dead-ends.
const REQUIRED_ROOM_COUNT = 2 + MINIBOSS_COUNT + MANGO_RUN_CAP; // 11

// ───────────────────────────────────────────────────────────────────────────
// Required-room placement (Poisson-disk, inner-interior).
// ───────────────────────────────────────────────────────────────────────────
// Inner-interior margin: required rooms keep TWO rings off the border so even a
// single-opening room (boss, dead-end) has its door facing a fully-connectable
// interior neighbour (a border-ring connector is constrained on its off-map
// edge and connects less reliably).
const INNER_MARGIN = 2;

// Place REQUIRED_ROOM_COUNT rooms in the inner-interior with Poisson-disk
// spacing, relaxing toward 1, with a deterministic lattice fallback so a result
// always lands. Roles (start / boss / mini-boss / mango) are assigned afterward
// in generateRunMap.
function placeRequired(rng: () => number, count: number): RoomGridCoord[] {
  const lo = INNER_MARGIN;
  const hiCol = ROOM_GRID_COLS - 1 - INNER_MARGIN;
  const hiRow = ROOM_GRID_ROWS - 1 - INNER_MARGIN;
  const spanCol = hiCol - lo + 1;
  const spanRow = hiRow - lo + 1;
  for (let spacing = MIN_ANCHOR_SPACING; spacing >= 1; spacing--) {
    const placed: RoomGridCoord[] = [];
    let attempts = 0;
    while (placed.length < count && attempts++ < 5000) {
      const coord = {
        col: lo + randInt(rng, spanCol),
        row: lo + randInt(rng, spanRow),
      };
      if (placed.some((p) => manhattan(p, coord) < spacing)) continue;
      placed.push(coord);
    }
    if (placed.length === count) return placed;
  }
  // Deterministic last resort: a sparse inner-interior lattice.
  const out: RoomGridCoord[] = [];
  for (let row = lo; row <= hiRow && out.length < count; row += 2) {
    for (let col = lo; col <= hiCol && out.length < count; col += 3) {
      out.push({ col, row });
    }
  }
  return out;
}

// Fisher-Yates shuffle (seeded). Used to spread mini-boss vs mango roles across
// the non-start, non-boss required coords.
function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────────────────────────────────────────────────────────────────────────
// Connector fill.
// ───────────────────────────────────────────────────────────────────────────

// Reward for placing `def` at (col,row) given already-placed ANCHOR or
// MINI-BOSS neighbors: strongly prefer connecting to such a neighbor's opening,
// and avoid opening into its wall. Both anchors and mini-bosses connect via
// overlap (not the per-set equality the hard constraint enforces between
// connectors), so both get this soft bias — otherwise a connector could wall
// off a mini-boss doorway and strand the arena.
function anchorAgreement(
  def: RoomDef,
  cells: (RoomDef | null)[][],
  col: number,
  row: number,
): number {
  let score = 0;
  for (const [edge, dc, dr] of DIRS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nr < 0 || nc >= ROOM_GRID_COLS || nr >= ROOM_GRID_ROWS)
      continue;
    const nb = cells[nr][nc];
    // Only anchors + mini-bosses use overlap-adjacency; connector↔connector
    // seams are governed by the hard equality constraint in satisfiesNeighbors.
    if (!nb || nb.kind === 'connector') continue;
    const anchorOpensHere = openingsOnEdge(nb, oppositeEdge(edge)).length > 0;
    if (anchorOpensHere) {
      score += roomsConnect(def, edge, nb) ? 2 : -1;
    } else {
      score += edgeClosed(def, edge) ? 1 : -1;
    }
  }
  return score;
}

// Border edges a connector at (col,row) must keep closed so no opening points
// off the map.
function satisfiesBorder(def: RoomDef, col: number, row: number): boolean {
  if (col === 0 && !edgeClosed(def, 'W')) return false;
  if (col === ROOM_GRID_COLS - 1 && !edgeClosed(def, 'E')) return false;
  if (row === 0 && !edgeClosed(def, 'N')) return false;
  if (row === ROOM_GRID_ROWS - 1 && !edgeClosed(def, 'S')) return false;
  return true;
}

// Hard constraints: border-closed + identical opening sets with already-placed
// CONNECTOR neighbors (left = W↔E, up = N↔S). Anchor neighbors don't constrain
// here (they connect via overlap; see anchorAgreement for the soft bias).
function satisfiesNeighbors(
  def: RoomDef,
  cells: (RoomDef | null)[][],
  col: number,
  row: number,
): boolean {
  if (!satisfiesBorder(def, col, row)) return false;
  const left = col > 0 ? cells[row][col - 1] : null;
  if (
    left &&
    left.kind === 'connector' &&
    !edgeOpeningsEqual(def, 'W', left, 'E')
  ) {
    return false;
  }
  const up = row > 0 ? cells[row - 1][col] : null;
  if (up && up.kind === 'connector' && !edgeOpeningsEqual(def, 'N', up, 'S')) {
    return false;
  }
  return true;
}

function pickConnector(
  rng: () => number,
  cells: (RoomDef | null)[][],
  col: number,
  row: number,
): RoomDef {
  // Tier 1: fully matched (border-closed + connector-neighbor opening-set
  // equality).
  let pool = CONNECTOR_DEFS.filter((d) =>
    satisfiesNeighbors(d, cells, col, row),
  );
  // Tier 2: border-only fallback when no Tier-1 template fits. This fires for
  // ~10% of connector placements, not rarely: the multi-opening "double" hubs
  // have a single mate and the two "fork" templates have none under the
  // per-set equality rule, so a cell whose committed neighbor sits across such
  // an edge drops here and accepts an asymmetric (one-sided) seam. That seam is
  // cosmetic — it is never traversed, because BFS connectivity AND runtime
  // transitions both use opening OVERLAP, not equality. Always non-empty: every
  // border/corner configuration has at least one matching L-bend.
  if (pool.length === 0) {
    pool = CONNECTOR_DEFS.filter((d) => satisfiesBorder(d, col, row));
  }
  // Among the pool, prefer the choices that best connect to adjacent anchors.
  // Score each candidate exactly once.
  const scored = pool.map((d) => ({
    d,
    s: anchorAgreement(d, cells, col, row),
  }));
  const best = scored.reduce((m, x) => Math.max(m, x.s), -Infinity);
  const top = scored.filter((x) => x.s === best);
  return top[randInt(rng, top.length)].d;
}

function fillConnectors(rng: () => number, cells: (RoomDef | null)[][]): void {
  for (let row = 0; row < ROOM_GRID_ROWS; row++) {
    for (let col = 0; col < ROOM_GRID_COLS; col++) {
      if (cells[row][col]) continue; // anchor already placed
      cells[row][col] = pickConnector(rng, cells, col, row);
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Path existence (BFS over overlap-adjacency).
// ───────────────────────────────────────────────────────────────────────────
const cellKey = (c: number, r: number): number => r * ROOM_GRID_COLS + c;

// BFS from `start`; returns the shortest path of coords to `goal`, or null if
// unreachable. `cells` must be fully filled (no nulls).
export function findPath(
  cells: RoomDef[][],
  start: RoomGridCoord,
  goal: RoomGridCoord,
): RoomGridCoord[] | null {
  const seen = new Set<number>([cellKey(start.col, start.row)]);
  const parent = new Map<number, number>();
  const queue: RoomGridCoord[] = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.col === goal.col && cur.row === goal.row) {
      const path: RoomGridCoord[] = [];
      let k: number | undefined = cellKey(cur.col, cur.row);
      while (k !== undefined) {
        path.push({
          col: k % ROOM_GRID_COLS,
          row: Math.floor(k / ROOM_GRID_COLS),
        });
        k = parent.get(k);
      }
      return path.reverse();
    }
    const def = cells[cur.row][cur.col];
    for (const [edge, dc, dr] of DIRS) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      if (nc < 0 || nr < 0 || nc >= ROOM_GRID_COLS || nr >= ROOM_GRID_ROWS)
        continue;
      const nk = cellKey(nc, nr);
      if (seen.has(nk)) continue;
      if (!roomsConnect(def, edge, cells[nr][nc])) continue;
      seen.add(nk);
      parent.set(nk, cellKey(cur.col, cur.row));
      queue.push({ col: nc, row: nr });
    }
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Public API.
// ───────────────────────────────────────────────────────────────────────────

// Generate a run map. With a numeric `seed` the result is reproducible. Retries
// (re-seeding deterministically) until the boss is reachable from the start;
// the connector fabric is highly connected, so this nearly always succeeds on
// the first attempt.
export function generateRunMap(seed?: number): RunMap {
  const baseSeed = seed ?? Math.floor(Math.random() * 0xffffffff);
  const MAX_ATTEMPTS = 200;
  let last: RunMap | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = mulberry32((baseSeed + attempt * 0x9e3779b1) >>> 0);

    // 11 required rooms, inner-interior so every single-opening room's door
    // faces a fully-connectable interior neighbour.
    const required = placeRequired(rng, REQUIRED_ROOM_COUNT);

    const cells: (RoomDef | null)[][] = Array.from(
      { length: ROOM_GRID_ROWS },
      () =>
        Array.from({ length: ROOM_GRID_COLS }, () => null as RoomDef | null),
    );

    // Roles: [0] = start (random L-bend). Of the rest, the farthest from start
    // is the boss (so the final goal reads as distant); the remaining nine split
    // into 4 mini-bosses + 5 mango dead-ends. Panther = farthest mini-boss.
    const startCoord = required[0];
    const rest = required
      .slice(1)
      .sort((a, b) => manhattan(b, startCoord) - manhattan(a, startCoord));
    const bossCoord = rest[0];
    const others = shuffle(rng, rest.slice(1)); // 9 coords
    const minibossCoords = others.slice(0, MINIBOSS_COUNT); // 4
    const mangoRoomCoords = others.slice(MINIBOSS_COUNT); // 5

    // Start: one of four L-bend rotations, random per run.
    cells[startCoord.row][startCoord.col] =
      START_LBEND_DEFS[randInt(rng, START_LBEND_DEFS.length)];

    // Boss: one of four arena versions, random per run; its stump centre drives
    // the win trigger.
    const bossVersion = BOSS_VERSIONS[randInt(rng, BOSS_VERSIONS.length)];
    cells[bossCoord.row][bossCoord.col] = bossVersion.def;
    const bossStumpCenter = bossVersion.stumpCenter;

    // The enlarged panther lives in the mini-boss farthest (Manhattan) from the
    // start, so it reads as a late, distant encounter.
    const pantherBossCoord = minibossCoords.reduce(
      (far, c) =>
        manhattan(c, startCoord) > manhattan(far, startCoord) ? c : far,
      minibossCoords[0],
    );
    // Distinct arena per slot: the panther room gets the Empty Throne; the other
    // three empty rooms get the bear/snake/gibbon designs (rotated in order).
    let emptyIdx = 0;
    minibossCoords.forEach((coord) => {
      const isPanther =
        coord.col === pantherBossCoord.col && coord.row === pantherBossCoord.row;
      cells[coord.row][coord.col] = isPanther
        ? PANTHER_DEF
        : EMPTY_DEFS[emptyIdx++ % EMPTY_DEFS.length];
    });

    // Mango dead-ends: five required dead-end rooms (random rotations) that hold
    // the run's mangos (Game places them on first entry).
    mangoRoomCoords.forEach((coord) => {
      cells[coord.row][coord.col] =
        MANGO_DEADEND_DEFS[randInt(rng, MANGO_DEADEND_DEFS.length)];
    });

    fillConnectors(rng, cells);
    const filled = cells as RoomDef[][];

    last = {
      cols: ROOM_GRID_COLS,
      rows: ROOM_GRID_ROWS,
      cells: filled,
      startCoord,
      bossCoord,
      bossStumpCenter,
      minibossCoords,
      pantherBossCoord,
      mangoRoomCoords,
    };
    // Require EVERY required room reachable from start: boss, the 4 mini-bosses,
    // and the 5 mango dead-ends (start is trivially reachable). The connector
    // fabric is highly connected, so the rare stranding just re-seeds — cheap.
    const allRequired = [
      bossCoord,
      ...minibossCoords,
      ...mangoRoomCoords,
    ];
    if (allRequired.every((c) => findPath(filled, startCoord, c) !== null)) {
      return last;
    }
  }

  // Essentially unreachable (P(200 disconnected fabrics) ≈ 0). Return the last
  // attempt so the game still runs; warn so it surfaces if it ever happens.
  console.warn(
    '[Junar] generateRunMap: required rooms unreachable after max attempts',
  );
  return last!;
}

// Look up the RoomDef at a grid coordinate.
export function roomAt(map: RunMap, coord: RoomGridCoord): RoomDef {
  return map.cells[coord.row][coord.col];
}

// ───────────────────────────────────────────────────────────────────────────
// Debug ASCII render (used by the generation harness / not shipped in the loop).
// Each room is a 3×3 block: centre glyph (S=start, B=boss, M=mini-boss,
// g=mango dead-end, '.'=connector) framed by door marks on its open edges. Path
// rooms upper-cased to '*' centres when `markPath` is set.
// ───────────────────────────────────────────────────────────────────────────
export function renderRunMapAscii(map: RunMap, markPath = true): string {
  const path = markPath
    ? findPath(map.cells, map.startCoord, map.bossCoord)
    : null;
  const onPath = new Set((path ?? []).map((c) => cellKey(c.col, c.row)));
  const mango = new Set(map.mangoRoomCoords.map((c) => cellKey(c.col, c.row)));

  const lines: string[] = [];
  for (let row = 0; row < map.rows; row++) {
    const r0: string[] = [];
    const r1: string[] = [];
    const r2: string[] = [];
    for (let col = 0; col < map.cols; col++) {
      const def = map.cells[row][col];
      const n = edgeClosed(def, 'N') ? ' ' : '|';
      const s = edgeClosed(def, 'S') ? ' ' : '|';
      const w = edgeClosed(def, 'W') ? ' ' : '-';
      const e = edgeClosed(def, 'E') ? ' ' : '-';
      let centre = '.';
      if (col === map.startCoord.col && row === map.startCoord.row) centre = 'S';
      else if (col === map.bossCoord.col && row === map.bossCoord.row)
        centre = 'B';
      else if (def.kind === 'miniboss') centre = 'M';
      else if (mango.has(cellKey(col, row))) centre = 'g';
      if (onPath.has(cellKey(col, row)) && centre === '.') centre = '*';
      r0.push(' ', n, ' ');
      r1.push(w, centre, e);
      r2.push(' ', s, ' ');
    }
    lines.push(r0.join(''), r1.join(''), r2.join(''));
  }
  return lines.join('\n');
}
