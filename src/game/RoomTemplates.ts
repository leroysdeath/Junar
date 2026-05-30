// Connector room templates for the traversable-maps refactor.
// See docs/ROADMAP-traversable-maps.md §5.2 (template authoring), §5.3
// (adjacency), §5.5 (per-opening wave bands), §5.9–5.10 (statics).
//
// This is a pure-data + parsing module (Step 8). It does NOT wire into the
// map generator (Step 3), the per-run static roll (Steps 5+6), or anchor
// authoring (Step 7) — those consume the structures defined here.
//
// Authoring conventions:
//   - Every template is a 29×17 ASCII grid (matching the room/canvas dims).
//   - Tile chars: '#' wall (tree), '.' floor (dirt),
//       's' small-static candidate (snake/gibbon only),
//       'S' standard-static candidate (any 1-tile type),
//       'N'/'H' family/hut markers (treated as floor; reserved for anchors).
//   - Openings are 3 tiles wide (matching the L1–L3 corridor convention).
//   - Canonical simple-adjacency positions: N/S edges open at cols 13–15;
//     E/W edges open at rows 7–9. Multi-opening variants vary position but
//     keep the 3-tile width.
//
// Shape inspirations: Labyrinth (Ravensburger) tile shapes and Saboteur
// (Moyersoen 2004) path cards — straights, L-bends, T-junctions, a 4-way
// cross, a dead-end chamber, multi-opening hubs, and interior-maze rooms.

import {
  Edge,
  RoomOpening,
  RoomTemplate,
  StaticCandidate,
} from './types';
import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE } from './constants';

// Chars that parse as walkable floor for the collision grid. 's'/'S' are also
// floor but additionally register a StaticCandidate; 'N'/'H' are anchor
// markers carried for forward-compat (connectors don't use them).
const FLOOR_CHARS = new Set(['.', 'N', 'H', 's', 'S']);

export interface ParsedRoomTemplate {
  walls: boolean[][];
  openings: RoomOpening[];
  candidates: StaticCandidate[];
}

// Collect contiguous open runs along one edge into RoomOpenings. `isOpen(i)`
// reports whether index i (col for N/S, row for E/W) is walkable on that edge;
// each maximal run becomes one opening with inclusive [rangeStart, rangeEnd].
function pushEdgeRuns(
  out: RoomOpening[],
  edge: Edge,
  length: number,
  isOpen: (i: number) => boolean,
): void {
  let start = -1;
  for (let i = 0; i < length; i++) {
    if (isOpen(i)) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      out.push({ edge, rangeStart: start, rangeEnd: i - 1 });
      start = -1;
    }
  }
  if (start !== -1) {
    out.push({ edge, rangeStart: start, rangeEnd: length - 1 });
  }
}

// Derive edge openings purely from the parsed walls grid, so openings can
// never drift from the actual walkable geometry. Order: N, S, W, E.
// Exported so the room-grid generator (Step 3) can derive anchor openings
// straight from each anchor level's walls (anchors aren't authored as
// connectors, so their openings come from geometry, same as connectors).
export function deriveOpenings(walls: boolean[][]): RoomOpening[] {
  const openings: RoomOpening[] = [];
  const lastRow = GRID_HEIGHT - 1;
  const lastCol = GRID_WIDTH - 1;
  pushEdgeRuns(openings, 'N', GRID_WIDTH, (col) => !walls[0][col]);
  pushEdgeRuns(openings, 'S', GRID_WIDTH, (col) => !walls[lastRow][col]);
  pushEdgeRuns(openings, 'W', GRID_HEIGHT, (row) => !walls[row][0]);
  pushEdgeRuns(openings, 'E', GRID_HEIGHT, (row) => !walls[row][lastCol]);
  return openings;
}

// Parse a 29×17 ASCII grid into walls + derived openings + static candidates.
// Asserts exact dimensions and rejects unknown tile chars. 's'/'S' parse as
// floor for the walls grid and additionally register a StaticCandidate at the
// tile's world-space pixel position (col*TILE_SIZE, row*TILE_SIZE).
export function parseRoomTemplate(ascii: string[]): ParsedRoomTemplate {
  if (ascii.length !== GRID_HEIGHT) {
    throw new Error(
      `Room template must have ${GRID_HEIGHT} rows; got ${ascii.length}`,
    );
  }
  const walls: boolean[][] = [];
  const candidates: StaticCandidate[] = [];
  for (let row = 0; row < GRID_HEIGHT; row++) {
    const line = ascii[row];
    if (line.length !== GRID_WIDTH) {
      throw new Error(
        `Room template row ${row} must have ${GRID_WIDTH} cols; got ${line.length} ("${line}")`,
      );
    }
    walls[row] = [];
    for (let col = 0; col < GRID_WIDTH; col++) {
      const ch = line[col];
      if (ch === '#') {
        walls[row][col] = true;
      } else if (FLOOR_CHARS.has(ch)) {
        walls[row][col] = false;
        if (ch === 's' || ch === 'S') {
          candidates.push({
            tile: { x: col * TILE_SIZE, y: row * TILE_SIZE },
            kind: ch === 's' ? 'small' : 'any',
          });
        }
      } else {
        throw new Error(
          `Unknown tile char "${ch}" at (${col},${row}) in room template`,
        );
      }
    }
  }
  return { walls, openings: deriveOpenings(walls), candidates };
}

// Authored connector source: id + raw ASCII. The walls/openings/candidates are
// derived by parseRoomTemplate; connectors carry no authored statics (empty).
interface ConnectorSource {
  id: string;
  ascii: string[];
}

// Connector-specific authoring invariants, enforced at module load so a bad
// hand-edit fails fast. These live here (not in the shared parseRoomTemplate)
// because anchor templates authored in Step 7 may legitimately break them —
// e.g. the boss arena (anchor 10) can have non-3-wide or zero edge openings.
const CONNECTOR_OPENING_WIDTH = 3; // tiles (matches the L1–L3 corridor convention)

function buildConnector(source: ConnectorSource): RoomTemplate {
  const parsed = parseRoomTemplate(source.ascii);
  if (parsed.openings.length === 0) {
    throw new Error(`Connector "${source.id}" has no openings (would be unreachable)`);
  }
  for (const o of parsed.openings) {
    const width = o.rangeEnd - o.rangeStart + 1;
    if (width !== CONNECTOR_OPENING_WIDTH) {
      throw new Error(
        `Connector "${source.id}" opening ${o.edge}:${o.rangeStart}-${o.rangeEnd} is ${width} tiles wide; connectors use ${CONNECTOR_OPENING_WIDTH}-tile openings`,
      );
    }
  }
  return {
    id: source.id,
    walls: parsed.walls,
    openings: parsed.openings,
    candidates: parsed.candidates,
    authoredStatics: [],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Re-implemented roadmap templates T1–T6 (docs/ROADMAP-traversable-maps.md
// §5.2). ASCII transcribed verbatim from the roadmap.
// ───────────────────────────────────────────────────────────────────────────

// T1 — Straight EW corridor (W rows 7–9, E rows 7–9).
const T_STRAIGHT_EW: ConnectorSource = {
  id: 't-straight-ew',
  ascii: [
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '.............................',
    '.......s.........S.........s.',
    '.............................',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ],
};

// T2 — Straight NS corridor (N cols 13–15, S cols 13–15).
const T_STRAIGHT_NS: ConnectorSource = {
  id: 't-straight-ns',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.S.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// T3 — NE L-bend (N cols 13–15, E rows 7–9).
const T_LBEND_NE: ConnectorSource = {
  id: 't-lbend-ne',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############................',
    '#############......S.........',
    '#############................',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ],
};

// T4 — 4-way cross (all four edges open at 3-wide centers).
const T_CROSS: ConnectorSource = {
  id: 't-cross',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '......s..........s.....s.....',
    '.............S...............',
    '......s..............s.......',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// T5 — T-junction, open-S stem (W/E bar + S stem; N closed).
const T_TJUNC_OPEN_S: ConnectorSource = {
  id: 't-tjunc-open-s',
  ascii: [
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '......s..........s.....s.....',
    '.............S...............',
    '......s..............s.......',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// T6 — Dead-end chamber (N only; chamber holds a static cache).
const T_DEADEND_N: ConnectorSource = {
  id: 't-deadend-n',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '##########.........##########',
    '##########.s.....s.##########',
    '##########....S....##########',
    '##########.........##########',
    '##########.s.....s.##########',
    '##########.........##########',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// New: 3 more L-bend rotations (NW, SE, SW) — complete the four-corner set
// alongside T3 (NE).
// ───────────────────────────────────────────────────────────────────────────

// NW L-bend (N cols 13–15, W rows 7–9).
const T_LBEND_NW: ConnectorSource = {
  id: 't-lbend-nw',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '................#############',
    '.........S......#############',
    '................#############',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ],
};

// SE L-bend (S cols 13–15, E rows 7–9).
const T_LBEND_SE: ConnectorSource = {
  id: 't-lbend-se',
  ascii: [
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############................',
    '#############......S.........',
    '#############................',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// SW L-bend (S cols 13–15, W rows 7–9).
const T_LBEND_SW: ConnectorSource = {
  id: 't-lbend-sw',
  ascii: [
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '................#############',
    '.........S......#############',
    '................#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// New: 3 more T-junction rotations (open-N, open-E, open-W) — complete the
// four-stem set alongside T5 (open-S). Each = a straight pass-through bar plus
// a perpendicular stem; named by stem direction.
// ───────────────────────────────────────────────────────────────────────────

// Open-N stem (W/E bar + N stem; S closed).
const T_TJUNC_OPEN_N: ConnectorSource = {
  id: 't-tjunc-open-n',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '......s..........s.....s.....',
    '.............S...............',
    '......s..............s.......',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ],
};

// Open-E stem (N/S bar + E stem; W closed).
const T_TJUNC_OPEN_E: ConnectorSource = {
  id: 't-tjunc-open-e',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############................',
    '#############.....S..........',
    '#############................',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// Open-W stem (N/S bar + W stem; E closed).
const T_TJUNC_OPEN_W: ConnectorSource = {
  id: 't-tjunc-open-w',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '................#############',
    '..........S.....#############',
    '................#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// New: multi-opening variants (hubs). The four "double" rooms put two 3-wide
// openings on one edge (5 openings total each). The two "fork" rooms put three
// 3-wide openings on one edge (comb shape).
// ───────────────────────────────────────────────────────────────────────────

// Double-N hub: two N openings (cols 5–7, 21–23) + W/E (rows 7–9) + S (cols 13–15).
const T_MULTIOPEN_DOUBLE_N: ConnectorSource = {
  id: 't-multiopen-double-n',
  ascii: [
    '#####...#############...#####',
    '#####...#############...#####',
    '#####...#############...#####',
    '#####.s.#############.s.#####',
    '#####...#############...#####',
    '#####...#############...#####',
    '#####...#############...#####',
    '.............................',
    '.............S...............',
    '.............................',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// Double-S hub: N (cols 13–15) + W/E (rows 7–9) + two S openings (cols 5–7, 21–23).
const T_MULTIOPEN_DOUBLE_S: ConnectorSource = {
  id: 't-multiopen-double-s',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '.............................',
    '.............S...............',
    '.............................',
    '#####...#############...#####',
    '#####...#############...#####',
    '#####...#############...#####',
    '#####.s.#############.s.#####',
    '#####...#############...#####',
    '#####...#############...#####',
    '#####...#############...#####',
  ],
};

// Double-E hub: N/S (cols 13–15) + two E openings (rows 3–5, 11–13) + W (rows 7–9).
const T_MULTIOPEN_DOUBLE_E: ConnectorSource = {
  id: 't-multiopen-double-e',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############................',
    '#############......S.........',
    '#############................',
    '#############...#############',
    '................#############',
    '.........s......#############',
    '................#############',
    '#############...#############',
    '#############................',
    '#############......S.........',
    '#############................',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// Double-W hub: N/S (cols 13–15) + two W openings (rows 3–5, 11–13) + E (rows 7–9).
const T_MULTIOPEN_DOUBLE_W: ConnectorSource = {
  id: 't-multiopen-double-w',
  ascii: [
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '................#############',
    '.........S......#############',
    '................#############',
    '#############...#############',
    '#############................',
    '#############......s.........',
    '#############................',
    '#############...#############',
    '................#############',
    '.........S......#############',
    '................#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// Fork-N comb: three N openings merging into a band, with a single S stem
// (cols 13–15). The N bands are 5–7 / 13–15 / 21–23 — deliberately the same
// columns the double-N/double-S hubs use, so every fork opening has a mating
// partner under the §5.3 adjacency rule. Do NOT shift these to the grid
// corners (3–5 / 23–25): no template offers an S opening there, which would
// leave the outer prongs unmateable.
const T_MULTIOPEN_FORK_N: ConnectorSource = {
  id: 't-multiopen-fork-n',
  ascii: [
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####.s.#####.s.#####.s.#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...#####...#####...#####',
    '#####...................#####',
    '#####.........S.........#####',
    '#####...................#####',
    '#############...#############',
    '#############...#############',
    '#############...#############',
    '#############.s.#############',
    '#############...#############',
    '#############...#############',
    '#############...#############',
  ],
};

// Fork-E comb: three E openings off a vertical spine, with a single W opening
// (rows 7–9); N/S closed. The E bands are 3–5 / 7–9 / 11–13 — the same rows the
// double-E/double-W hubs use, so every fork opening has a mating partner under
// the §5.3 adjacency rule (don't shift these to rows 1–3 / 13–15: no template
// offers a W opening there).
const T_MULTIOPEN_FORK_E: ConnectorSource = {
  id: 't-multiopen-fork-e',
  ascii: [
    '#############################',
    '#############################',
    '#############################',
    '#############................',
    '#############......S.........',
    '#############................',
    '#############.s.#############',
    '.............................',
    '.........s.......S...........',
    '.............................',
    '#############.s.#############',
    '#############................',
    '#############......S.........',
    '#############................',
    '#############################',
    '#############################',
    '#############################',
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// New: interior-maze variants — corridors/chambers with extra interior wall
// structures that block sightlines and force weaving (tactical cover).
// ───────────────────────────────────────────────────────────────────────────

// Cross-pillars chamber: 4-way openings (canonical centers) around an open
// chamber with four interior pillar blocks. The central cross corridor and the
// inner-wall margins keep every region connected.
const T_MAZE_CROSS_PILLARS: ConnectorSource = {
  id: 't-maze-cross-pillars',
  ascii: [
    '#############...#############',
    '#.s.........................#',
    '#...######.........######...#',
    '#...######....s....######...#',
    '#...######.........######...#',
    '#...######.........######...#',
    '#...........................#',
    '.............................',
    '..............S..............',
    '.............................',
    '#...........................#',
    '#...######.........######...#',
    '#...######.........######...#',
    '#...######....s....######...#',
    '#...######.........######...#',
    '#.........................s.#',
    '#############...#############',
  ],
};

// Chicane corridor (EW): a single W↔E corridor (openings rows 7–9) threaded
// past three alternating baffles, forcing the player to weave up and down.
const T_MAZE_CHICANE_EW: ConnectorSource = {
  id: 't-maze-chicane-ew',
  ascii: [
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#.....###.........###.......#',
    '#..s..###....S....###....s..#',
    '......###.........###........',
    '......###...###...###........',
    '............###..............',
    '#....s......###.............#',
    '#...........###.............#',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
    '#############################',
  ],
};

// The connector template pool (~20). The map generator (Step 3) draws from
// this; the per-run static roll (Steps 5+6) uses each template's candidates.
export const CONNECTOR_TEMPLATE_SOURCES: ConnectorSource[] = [
  // Roadmap T1–T6.
  T_STRAIGHT_EW,
  T_STRAIGHT_NS,
  T_LBEND_NE,
  T_CROSS,
  T_TJUNC_OPEN_S,
  T_DEADEND_N,
  // L-bends.
  T_LBEND_NW,
  T_LBEND_SE,
  T_LBEND_SW,
  // T-junctions.
  T_TJUNC_OPEN_N,
  T_TJUNC_OPEN_E,
  T_TJUNC_OPEN_W,
  // Multi-opening hubs.
  T_MULTIOPEN_DOUBLE_N,
  T_MULTIOPEN_DOUBLE_S,
  T_MULTIOPEN_DOUBLE_E,
  T_MULTIOPEN_DOUBLE_W,
  T_MULTIOPEN_FORK_N,
  T_MULTIOPEN_FORK_E,
  // Interior mazes.
  T_MAZE_CROSS_PILLARS,
  T_MAZE_CHICANE_EW,
];

export const CONNECTOR_TEMPLATE_POOL: RoomTemplate[] =
  CONNECTOR_TEMPLATE_SOURCES.map(buildConnector);
