// Room-grid generator for the traversable-maps refactor (Step 3).
//
// A run is a ROOM_GRID_COLS × ROOM_GRID_ROWS grid of rooms (493 total),
// regenerated every run. REQUIRED_ROOM_COUNT (12) cells are guaranteed each run
// — the start (a random L-bend), the boss arena (one of four versions), the four
// mini-boss arenas, five mango dead-ends, and the village; the rest are
// connectors drawn from the FABRIC pool (canonical-edge rooms, which also
// carries the demoted anchor-1/-5/-9 layouts, normalized to canonical doors).
// The player traverses room-to-room from the start toward the boss.
// See docs/ROADMAP-traversable-maps.md §5.1 (run structure), §5.2 (templates),
// §5.3 (transitions).
//
// Generation pipeline (generateRunMap):
//   1. Poisson-disk place the 12 required rooms in the INNER interior (≥
//      MIN_ANCHOR_SPACING apart; two rings off the border so even a single-
//      opening room's door faces a fully-connectable interior neighbour), then
//      assign roles (farthest-from-start = boss; rest split mini-boss / mango /
//      village).
//   2. Force off-centre ADAPTERS around the two arenas whose openings have no
//      canonical mate (snake / gibbon), and the four inward-pointing ARROW rooms
//      around the village, so their doorways flow into the fabric.
//   3. Fill every other cell from the FABRIC pool, reciprocating every placed
//      neighbour exactly (satisfiesNeighbors).
//   4. BFS path-existence from the start; if any required room is unreachable,
//      regenerate.
//
// ── No-fake-lane guarantee (the adjacency model) ─────────────────────────────
// Every opening on every placed room reciprocates into a walkable opening across
// the border — no "lane into a wall". This holds because:
//   • The FABRIC pool (the only random-fill pool) has CANONICAL openings only
//     (N/S cols 13-15, E/W rows 7-9) and is CLOSED under opening-set equality, so
//     the fill can always reciprocate a neighbour. satisfiesNeighbors requires
//     IDENTICAL opening sets with EVERY placed neighbour, of any kind.
//   • Special rooms either expose only canonical doors (boss / bear / panther /
//     start / mango / village), or have their off-centre doors mated by a force-
//     placed ADAPTER (the snake / gibbon arenas + the village arrows — see
//     forceAdapter / forceVillageArrows). (The demoted anchors are no longer
//     placed at all — reclassified as defined-only hubs, see ANCHOR_HUB_DEFS.)
//   • A solid GROVE backstops the rare fully-enclosed cell with no fake lane.
// Verified at scale by scripts/map-harness/check-openings.mjs (0 fake lanes over
// thousands of seeds). Runtime transitions still use opening OVERLAP (roomsConnect
// / openingsOnEdge); with full reciprocity, overlap and identity now agree.

import {
  Edge,
  Hut,
  RoomDef,
  RoomGridCoord,
  RoomKind,
  RoomOpening,
  RoomTemplate,
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
import {
  FABRIC_TEMPLATE_POOL,
  ADAPTER_TEMPLATE_POOL,
  deriveOpenings,
} from './RoomTemplates';

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

// anchor-1 / -5 / -9 reclassified as DEFINED-ONLY HUB CONNECTORS (owner
// 2026-06-21). They were briefly demoted into the random-fill FABRIC pool
// (2026-06-20) as canonical crosses — but sealing their authored off-centre
// entries to make them fabric-safe left vestigial dead-end strips, and a sealed
// cross is just a redundant t-cross. Instead we COMPLETE those off-centre
// pathways (carve the canonical doors, then keep the authored off-centre
// corridors open through to the edge) so each becomes a genuine MULTI-OPENING
// hub: anchor-1 a double-N, anchor-5 an N/S Z-hub, anchor-9 a triple-N/triple-S
// grid hub. Because those off-centre openings have no canonical mate they'd
// fake-lane in random fill, so these are NOT in FABRIC — they're a defined-only
// library (like the unplaced double-*/fork-* hubs), kept for the catalog and any
// future force-placement. NPC/hut markers are dropped (family rendering paused,
// CLAUDE.md §6). The boss (its own four-version registry below) remains the only
// required hand-authored room.
const ANCHOR_HUB_LEVEL_INDICES = [0, 4, 8]; // levels.ts: anchor-1, -5, -9
export const ANCHOR_HUB_DEFS: RoomDef[] = ANCHOR_HUB_LEVEL_INDICES.map(
  (lvlIdx) => {
    // Carve the canonical cross, but DON'T normalize: the authored off-centre
    // corridors stay open to the edge (completed pathways → multi-opening hub).
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

// A connector RoomDef from a template. Shared by reference across every cell
// that uses the same template — they're read-only, so no per-cell copy is needed.
function connectorDef(t: RoomTemplate): RoomDef {
  return {
    kind: 'connector',
    templateId: t.id,
    anchorIndex: null,
    walls: t.walls,
    openings: t.openings,
    candidates: t.candidates,
    authoredStatics: t.authoredStatics,
    npcPositions: [],
    hutPositions: [],
  };
}

// FABRIC pool — the ONLY rooms the random connector fill draws from. Canonical-
// edge-only templates, closed under the opening-set-equality adjacency rule, so
// the fill can always reciprocate every placed neighbour → no connector fake
// lanes. See FABRIC_TEMPLATE_POOL and satisfiesNeighbors.
//
// Junction-density weighting: the 4-way cross is the only room that reciprocates
// all four neighbours, so it carries the fabric's connectivity (the fill picks
// uniformly over the satisfying defs). The demoted anchors used to sit in this
// pool as three extra canonical-cross defs; pulling them out (reclassified as
// ANCHOR_HUB_DEFS, 2026-06-21) thinned junction density enough to strand a
// required room in ~0.7% of seeds. We re-weight the cross by that same count —
// it's opening-identical to those normalized anchors, so this restores the exact
// prior fill distribution with no redundant room defs (verified by
// check-openings.mjs: back to 0 unreachable seeds).
const FABRIC_CROSS_WEIGHT = 3; // = the 3 ex-anchor crosses this replaces
const crossTemplate = FABRIC_TEMPLATE_POOL.find((t) => t.id === 't-cross');
if (!crossTemplate) throw new Error('[Junar] FABRIC pool missing t-cross');
const crossDef = connectorDef(crossTemplate);
const FABRIC_DEFS: RoomDef[] = [
  ...FABRIC_TEMPLATE_POOL.map(connectorDef),
  ...Array.from({ length: FABRIC_CROSS_WEIGHT }, () => crossDef),
];

// ADAPTER pool — the off-centre hubs/forks/links. NEVER random-placed; the
// generator force-places one of these next to the specific special-room opening
// it mates (see forceAdapter). Looked up by template id.
const ADAPTER_DEF_BY_ID: Map<string, RoomDef> = new Map(
  ADAPTER_TEMPLATE_POOL.map((t) => [t.id, connectorDef(t)]),
);

// A solid all-trees room, used ONLY as the fill's last resort when a cell is
// hemmed in by closed-facing neighbours on every side (so no opening-bearing
// fabric room fits). Having no openings, it reciprocates closed edges perfectly
// and can never create a fake lane. Built directly (an opening-less room would
// fail buildConnector's invariants).
export const GROVE_DEF: RoomDef = {
  kind: 'connector',
  templateId: 'grove-solid',
  anchorIndex: null,
  walls: Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(true)),
  openings: [],
  candidates: [],
  authoredStatics: [],
  npcPositions: [],
  hutPositions: [],
};

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

// Build a RoomDef from an authored arena: '#' = tree wall and 's'/'S' = solid
// hut footprints (owner 2026-06-21), everything else ('.', 'N', 'H') floor;
// openings derived from geometry, no statics. Shared by reference (read-only).
// Parse hut footprints out of an arena's ASCII (owner 2026-06-21, the village).
// 's' = small hut, 'S' = large hut. Each footprint is a 4-connected blob of the
// same marker; we emit one Hut per blob, foot-anchored at the bottom-centre of
// its bounding box (world px), so the renderer draws the sprite overflowing
// upward. Arenas without 's'/'S' (every miniboss) yield []. The footprint tiles
// are SOLID walls (buildArenaDef) so huts block movement / LOS / pathfinding;
// the hutTiles mask makes renderLevel draw dirt (not trees) on them, under the
// hut sprite.
function parseHuts(ascii: readonly string[]): Hut[] {
  const rows = ascii.length;
  const cols = ascii[0]?.length ?? 0;
  const seen: boolean[][] = ascii.map((r) => [...r].map(() => false));
  const huts: Hut[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = ascii[r][c];
      if ((ch !== 's' && ch !== 'S') || seen[r][c]) continue;
      // Flood the contiguous same-marker blob, tracking its bounding box.
      let minC = c,
        maxC = c,
        minR = r,
        maxR = r;
      const stack: [number, number][] = [[r, c]];
      seen[r][c] = true;
      while (stack.length) {
        const [cr, cc] = stack.pop() as [number, number];
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          if (seen[nr][nc] || ascii[nr][nc] !== ch) continue;
          seen[nr][nc] = true;
          stack.push([nr, nc]);
        }
      }
      huts.push({
        pos: {
          x: ((minC + maxC + 1) / 2) * TILE_SIZE,
          y: (maxR + 1) * TILE_SIZE,
        },
        size: ch === 'S' ? 'large' : 'small',
      });
    }
  }
  return huts;
}

function buildArenaDef(
  arena: { id: string; ascii: readonly string[] },
  kind: RoomKind,
): RoomDef {
  const isHut = (ch: string) => ch === 's' || ch === 'S';
  // Tree walls AND solid hut footprints both block; the hutTiles mask lets the
  // renderer draw dirt (not trees) under the hut sprite on the footprint tiles.
  const walls = arena.ascii.map((row) =>
    [...row].map((ch) => ch === '#' || isHut(ch)),
  );
  const hutTiles = arena.ascii.map((row) => [...row].map((ch) => isHut(ch)));
  return {
    kind,
    templateId: arena.id,
    anchorIndex: null,
    walls,
    openings: deriveOpenings(walls),
    candidates: [],
    authoredStatics: [],
    npcPositions: [],
    hutPositions: [],
    huts: parseHuts(arena.ascii),
    hutTiles,
  };
}
const buildMinibossDef = (arena: { id: string; ascii: readonly string[] }) =>
  buildArenaDef(arena, 'miniboss');
const PANTHER_DEF = buildMinibossDef(PANTHER_ARENA);
const EMPTY_DEFS = EMPTY_ARENAS.map(buildMinibossDef);

// ───────────────────────────────────────────────────────────────────────────
// Village cluster (owner 2026-06-21).
// ───────────────────────────────────────────────────────────────────────────
// A required "village" room ringed by four "arrow" rooms — one per orthogonal
// neighbour, each pointing INWARD at the village (the arrowhead decoration faces
// the village it guards). The arrows are FORCE-PLACED around the village cell
// (like the snake/gibbon link adapters), so the cluster always reads the same:
//
//        [arrow-s]                 village's N neighbour = arrow-s (points S↓)
//   [arrow-e][village][arrow-w]    W = arrow-e (→),  E = arrow-w (←)
//        [arrow-n]                 S neighbour = arrow-n (points N↑)
//
// Every arrow keeps the full canonical cross of openings (N/S 13-15, E/W 7-9),
// so it mates the village on the arrow side and threads the corridor fabric on
// the other three — no fake lanes (the fabric is closed under canonical opening
// sets). The village's 's'/'S' tiles are hut footprints (2×2 / 3×3), NOT enemy-
// static candidates, so it's built with candidates [] (huts render procedurally
// in a later pass; for now they're plain floor). MIN_ANCHOR_SPACING (5) keeps
// the village ≥5 from every other required room, so its four arrow cells are
// always free and in-grid (the village is placed inner-interior).
//
// arrow-s is the owner-authored source; arrow-n is its 180° turn. arrow-w is
// owner-authored; arrow-e is arrow-w mirrored left↔right (a literal 90° turn
// would make a 17×29 room pointing N/S — the mirror is the valid east arrow).
const VILLAGE_ARENA = {
  id: 'village',
  ascii: [
    '#############...#############',
    '#...........................#',
    '#..................ss.......#',
    '#..ss..ss...ss.....ss....ss.#',
    '#..ss..ss...ss...........ss.#',
    '#..................ss.......#',
    '#...ss...ss........ss.ss....#',
    '....ss...ss..SSS......ss.....',
    '.............SSS.............',
    '.............SSS...ss........',
    '#..................ss.......#',
    '#.....ss................ss..#',
    '#.....ss...ss.....ss....ss..#',
    '#..ss......ss.....ss.ss.....#',
    '#..ss................ss.....#',
    '#...........................#',
    '#############...#############',
  ],
} as const;

// One entry per village edge: the arrow placed in that neighbour cell, pointing
// back at the village. `face` is the arrow's village-facing edge (must be open).
const ARROW_ARENAS = {
  // village N neighbour — arrow-s (arrow points S, down into the village).
  N: {
    face: 'S' as Edge,
    id: 'arrow-s',
    ascii: [
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
      '#######...#########...#######',
      '########...#######...########',
      '#########...#####...#########',
      '##########...###...##########',
      '###########.......###########',
      '############.....############',
      '#############...#############',
    ],
  },
  // village S neighbour — arrow-n (180° of arrow-s; arrow points N, up into it).
  S: {
    face: 'N' as Edge,
    id: 'arrow-n',
    ascii: [
      '#############...#############',
      '############.....############',
      '###########.......###########',
      '##########...###...##########',
      '#########...#####...#########',
      '########...#######...########',
      '#######...#########...#######',
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
  },
  // village W neighbour — arrow-e (arrow-w mirrored; arrow points E, into it).
  W: {
    face: 'E' as Edge,
    id: 'arrow-e',
    ascii: [
      '#############...#############',
      '#############..........######',
      '#############...........#####',
      '#############............####',
      '#############...######....###',
      '#############...#######....##',
      '#############...########....#',
      '................#########....',
      '................##########...',
      '................#########....',
      '#############...########....#',
      '#############...#######....##',
      '#############...######....###',
      '#############............####',
      '#############...........#####',
      '#############..........######',
      '#############...#############',
    ],
  },
  // village E neighbour — arrow-w (owner-authored; arrow points W, into it).
  E: {
    face: 'W' as Edge,
    id: 'arrow-w',
    ascii: [
      '#############...#############',
      '######..........#############',
      '#####...........#############',
      '####............#############',
      '###....######...#############',
      '##....#######...#############',
      '#....########...#############',
      '....#########................',
      '...##########................',
      '....#########................',
      '#....########...#############',
      '##....#######...#############',
      '###....######...#############',
      '####............#############',
      '#####...........#############',
      '######..........#############',
      '#############...#############',
    ],
  },
} as const;

const VILLAGE_DEF = buildArenaDef(VILLAGE_ARENA, 'anchor');
// village edge → the arrow RoomDef to force into that neighbour cell.
const ARROW_DEF_BY_VILLAGE_EDGE: Record<Edge, RoomDef> = {
  N: buildArenaDef(ARROW_ARENAS.N, 'connector'),
  S: buildArenaDef(ARROW_ARENAS.S, 'connector'),
  W: buildArenaDef(ARROW_ARENAS.W, 'connector'),
  E: buildArenaDef(ARROW_ARENAS.E, 'connector'),
};

// Fail-fast authoring guard (runs at module load): the village and every arrow
// must expose ONLY canonical openings (N/S 13-15, E/W 7-9) so the cluster never
// fake-lanes into the fabric, and each arrow's village-facing edge must be open
// so the cluster actually connects. Catches a bad hand-edit to any arrow ASCII.
function isCanonicalOpening(o: RoomOpening): boolean {
  return o.edge === 'N' || o.edge === 'S'
    ? o.rangeStart === DOOR_COLS[0] && o.rangeEnd === DOOR_COLS[2]
    : o.rangeStart === DOOR_ROWS[0] && o.rangeEnd === DOOR_ROWS[2];
}
(function assertVillageCluster() {
  for (const def of [VILLAGE_DEF, ...Object.values(ARROW_DEF_BY_VILLAGE_EDGE)]) {
    for (const o of def.openings) {
      if (!isCanonicalOpening(o)) {
        throw new Error(
          `[Junar] village cluster "${def.templateId}" has a non-canonical opening ${o.edge}:${o.rangeStart}-${o.rangeEnd} (would fake-lane)`,
        );
      }
    }
  }
  for (const edge of ['N', 'S', 'W', 'E'] as Edge[]) {
    const arrow = ARROW_ARENAS[edge];
    const def = ARROW_DEF_BY_VILLAGE_EDGE[edge];
    if (!def.openings.some((o) => o.edge === arrow.face)) {
      throw new Error(
        `[Junar] arrow "${arrow.id}" has no ${arrow.face} opening to mate the village`,
      );
    }
  }
})();

// Debug/tooling (room-catalog renderer): every mini-boss arena built as a def,
// keyed by its MINIBOSS_ARENAS key — includes the saved alternates that the
// generator does not currently place. Not used by the game loop. See
// scripts/map-harness/render-room-catalog.mjs.
export const MINIBOSS_DEFS: { key: string; def: RoomDef }[] = Object.entries(
  MINIBOSS_ARENAS,
).map(([key, arena]) => ({ key, def: buildMinibossDef(arena) }));

// ───────────────────────────────────────────────────────────────────────────
// Boss arena (anchor-10) — four versions (owner 2026-06-20).
// ───────────────────────────────────────────────────────────────────────────
// Each is a wide-open arena ringed by border trees with EXACTLY ONE canonical
// doorway and a solid 3×3 tree "stump" at the FAR end (M = its centre tile).
// Touching the stump wins the run (Game.isTouchingGrowthHeart vs
// RunMap.bossStumpCenter). One version is picked at random per run. The single
// opening is why the boss is placed inner-interior (placeRequired) — its door
// always faces a fully-connectable interior neighbour.
export interface BossVersion {
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
export const BOSS_VERSIONS: BossVersion[] = [
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
  const t = FABRIC_TEMPLATE_POOL.find((x) => x.id === id);
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

// Required rooms per run (Poisson-placed): start L-bend + boss + mini-bosses +
// mango dead-ends + the village (its four arrow neighbours are force-placed
// around it, not Poisson-placed, so they don't count here).
const REQUIRED_ROOM_COUNT = 2 + MINIBOSS_COUNT + MANGO_RUN_CAP + 1; // 12

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

// Border edges a connector at (col,row) must keep closed so no opening points
// off the map.
function satisfiesBorder(def: RoomDef, col: number, row: number): boolean {
  if (col === 0 && !edgeClosed(def, 'W')) return false;
  if (col === ROOM_GRID_COLS - 1 && !edgeClosed(def, 'E')) return false;
  if (row === 0 && !edgeClosed(def, 'N')) return false;
  if (row === ROOM_GRID_ROWS - 1 && !edgeClosed(def, 'S')) return false;
  return true;
}

// Hard constraint: border-closed + IDENTICAL opening sets with EVERY already-
// placed neighbour, of ANY kind (connector, anchor, mini-boss). Identity — not
// mere overlap — is what guarantees full reciprocity: every opening tile on the
// shared edge has a walkable partner directly across it, so the seam can never
// read as a fake lane on either side. Right/down neighbours are usually still
// null during the row-major fill (constrained when those cells fill), but the
// guaranteed special rooms and their forced adapters ARE pre-placed, so this
// also pins the fabric to reciprocate them. Because the FABRIC pool is closed
// under this rule and every special exposes only canonical / force-adapted
// edges, a satisfying fabric room (or the grove) always exists.
function satisfiesNeighbors(
  def: RoomDef,
  cells: (RoomDef | null)[][],
  col: number,
  row: number,
): boolean {
  if (!satisfiesBorder(def, col, row)) return false;
  for (const [edge, dc, dr] of DIRS) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nr < 0 || nc >= ROOM_GRID_COLS || nr >= ROOM_GRID_ROWS)
      continue;
    const nb = cells[nr][nc];
    if (!nb) continue; // not yet placed — constrained when that cell fills
    if (!edgeOpeningsEqual(def, edge, nb, oppositeEdge(edge))) return false;
  }
  return true;
}

function pickConnector(
  rng: () => number,
  cells: (RoomDef | null)[][],
  col: number,
  row: number,
): RoomDef {
  const pool = FABRIC_DEFS.filter((d) => satisfiesNeighbors(d, cells, col, row));
  if (pool.length > 0) return pool[randInt(rng, pool.length)];
  // No opening-bearing fabric room fits ⟹ every placed neighbour is closed-
  // facing here ⟹ the solid grove reciprocates them all with zero fake lanes.
  // (The harness asserts this branch only ever yields closed seams.)
  return GROVE_DEF;
}

// Place `def` into the cell across `edge` from `coord`. No-op if that cell is
// off-grid or already filled. The shared primitive behind forceAdapter (snake /
// gibbon link rooms) and the village-cluster arrow placement.
function placeAcross(
  cells: (RoomDef | null)[][],
  coord: RoomGridCoord,
  edge: Edge,
  def: RoomDef | undefined,
): void {
  const dir = DIRS.find(([e]) => e === edge);
  if (!dir || !def) return;
  const nc = coord.col + dir[1];
  const nr = coord.row + dir[2];
  if (nc < 0 || nr < 0 || nc >= ROOM_GRID_COLS || nr >= ROOM_GRID_ROWS) return;
  if (cells[nr][nc]) return; // occupied (e.g. another special) — leave it
  cells[nr][nc] = def;
}

// Force the matching off-centre adapter into the cell across `edge` from a
// special room whose edge opening has no canonical mate (the snake / gibbon
// arenas). The adapter's facing edge is authored to equal that arena edge
// exactly (tile-identical → no fake lane); its other edges are canonical/closed
// so the surrounding fabric reciprocates them normally.
function forceAdapter(
  cells: (RoomDef | null)[][],
  coord: RoomGridCoord,
  edge: Edge,
  adapterId: string,
): void {
  placeAcross(cells, coord, edge, ADAPTER_DEF_BY_ID.get(adapterId));
}

// Force the village cluster: the four arrow rooms into the village's orthogonal
// neighbour cells, each pointing inward (ARROW_DEF_BY_VILLAGE_EDGE). With
// MIN_ANCHOR_SPACING (5) those cells are always free and in-grid, so all four
// land — but placeAcross degrades gracefully (leaves the fabric to reciprocate)
// in the impossible event one is occupied.
function forceVillageArrows(
  cells: (RoomDef | null)[][],
  villageCoord: RoomGridCoord,
): void {
  for (const edge of ['N', 'S', 'W', 'E'] as Edge[]) {
    placeAcross(cells, villageCoord, edge, ARROW_DEF_BY_VILLAGE_EDGE[edge]);
  }
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

// True iff the fully-filled map has zero "fake lanes": every opening tile faces
// a reciprocating opening across its border, and no opening points off-grid.
// The connector fill only constrains each cell against its already-placed
// (up/left) neighbours, so a late grove fallback can still leave a down/right
// opening unmated — invisible to the fill but a walk-into-a-wall pocket in play.
// This whole-map pass is a generation acceptance gate (alongside reachability)
// so generateRunMap re-seeds past such maps. On the full 29×17 map fake lanes
// never occur; on a smaller demo grid the structured rooms crowd enough that a
// single placement occasionally leaves one, so the re-seed is what keeps every
// shipped map clean. Mirrors scripts/map-harness/check-openings.mjs.
function mapHasZeroFakeLanes(cells: RoomDef[][]): boolean {
  for (let row = 0; row < ROOM_GRID_ROWS; row++) {
    for (let col = 0; col < ROOM_GRID_COLS; col++) {
      const def = cells[row][col];
      // An opening on a map-border edge points off-grid → fake lane.
      if (!satisfiesBorder(def, col, row)) return false;
      // Every in-grid neighbour must reciprocate this edge's openings exactly.
      for (const [edge, dc, dr] of DIRS) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= ROOM_GRID_COLS || nr >= ROOM_GRID_ROWS)
          continue;
        if (!edgeOpeningsEqual(def, edge, cells[nr][nc], oppositeEdge(edge)))
          return false;
      }
    }
  }
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// Public API.
// ───────────────────────────────────────────────────────────────────────────

// Generate a run map. With a numeric `seed` the result is reproducible. Retries
// (re-seeding deterministically) until every required room is reachable from the
// start AND the map has zero fake lanes (mapHasZeroFakeLanes); the connector
// fabric is highly connected and most maps are already clean, so this nearly
// always succeeds within a few attempts.
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
    // is the boss (so the final goal reads as distant); the remaining ten split
    // into 4 mini-bosses + 5 mango dead-ends + 1 village. Panther = farthest
    // mini-boss.
    const startCoord = required[0];
    const rest = required
      .slice(1)
      .sort((a, b) => manhattan(b, startCoord) - manhattan(a, startCoord));
    const bossCoord = rest[0];
    const others = shuffle(rng, rest.slice(1)); // 10 coords
    const minibossCoords = others.slice(0, MINIBOSS_COUNT); // 4
    const mangoRoomCoords = others.slice(
      MINIBOSS_COUNT,
      MINIBOSS_COUNT + MANGO_RUN_CAP,
    ); // 5
    const villageCoord = others[MINIBOSS_COUNT + MANGO_RUN_CAP]; // 1

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
    let snakeCoord: RoomGridCoord | null = null;
    let gibbonCoord: RoomGridCoord | null = null;
    minibossCoords.forEach((coord) => {
      const isPanther =
        coord.col === pantherBossCoord.col && coord.row === pantherBossCoord.row;
      const def = isPanther ? PANTHER_DEF : EMPTY_DEFS[emptyIdx++ % EMPTY_DEFS.length];
      cells[coord.row][coord.col] = def;
      if (def.templateId === 'miniboss-snake') snakeCoord = coord;
      if (def.templateId === 'miniboss-gibbon') gibbonCoord = coord;
    });

    // Mango dead-ends: five required dead-end rooms (random rotations) that hold
    // the run's mangos (Game places them on first entry).
    mangoRoomCoords.forEach((coord) => {
      cells[coord.row][coord.col] =
        MANGO_DEADEND_DEFS[randInt(rng, MANGO_DEADEND_DEFS.length)];
    });

    // Village cluster: the village room plus its four inward-pointing arrow
    // neighbours, force-placed around the village cell (see forceVillageArrows).
    cells[villageCoord.row][villageCoord.col] = VILLAGE_DEF;
    forceVillageArrows(cells, villageCoord);

    // Force the off-centre adapters around the two arenas whose openings have no
    // canonical mate, so their doorways flow into the fabric with no fake lanes.
    // The snake arena opens on all four edges; the gibbon arena only N/S (its
    // closed E/W are reciprocated by the fabric). All other specials (boss, bear,
    // panther, start, mango) expose only canonical doors, handled by the fill.
    if (snakeCoord) {
      forceAdapter(cells, snakeCoord, 'N', 't-snake-link-n');
      forceAdapter(cells, snakeCoord, 'S', 't-snake-link-s');
      forceAdapter(cells, snakeCoord, 'W', 't-snake-link-w');
      forceAdapter(cells, snakeCoord, 'E', 't-snake-link-e');
    }
    if (gibbonCoord) {
      forceAdapter(cells, gibbonCoord, 'N', 't-gibbon-link-n');
      forceAdapter(cells, gibbonCoord, 'S', 't-gibbon-link-s');
    }

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
      villageCoord,
    };
    // Require EVERY required room reachable from start: boss, the 4 mini-bosses,
    // the 5 mango dead-ends, and the village (start is trivially reachable). The
    // connector fabric is highly connected, so the rare stranding just re-seeds —
    // cheap. The four arrows bridge the village to the fabric, so they're
    // reachable iff the village is.
    const allRequired = [
      bossCoord,
      ...minibossCoords,
      ...mangoRoomCoords,
      villageCoord,
    ];
    const allReachable = allRequired.every(
      (c) => findPath(filled, startCoord, c) !== null,
    );
    if (allReachable && mapHasZeroFakeLanes(filled)) {
      return last;
    }
  }

  // No reachable, fake-lane-free map in MAX_ATTEMPTS (P ≈ 0 on supported grids —
  // most maps pass on the first attempt). Return the last attempt so the game
  // still runs; warn so it surfaces if a grid is ever sized too small to
  // generate cleanly.
  console.warn(
    '[Junar] generateRunMap: no reachable, fake-lane-free map after max attempts',
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
// g=mango dead-end, V=village, a=arrow, '.'=connector) framed by door marks on
// its open edges. Path rooms upper-cased to '*' centres when `markPath` is set.
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
      else if (col === map.villageCoord.col && row === map.villageCoord.row)
        centre = 'V';
      else if (def.templateId.startsWith('arrow-')) centre = 'a';
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
