// Room-grid generator for the traversable-maps refactor (Step 3).
//
// A run is a ROOM_GRID_COLS × ROOM_GRID_ROWS grid of rooms (493 total),
// regenerated every run. Ten of the cells are anchors (the hand-designed
// levels: anchor 1 = start, anchor 10 = boss); the rest are connectors drawn
// from CONNECTOR_TEMPLATE_POOL. The player traverses room-to-room from anchor
// 1 toward the boss. See docs/ROADMAP-traversable-maps.md §5.1 (run structure),
// §5.2 (templates), §5.3 (transitions).
//
// Generation pipeline (generateRunMap):
//   1. Poisson-disk place the 10 anchors in the interior (≥ MIN_ANCHOR_SPACING
//      Manhattan rooms apart; kept off the outer ring so anchor openings never
//      point off-map).
//   2. Fill every non-anchor cell with a connector whose openings are
//      compatible with already-placed neighbors and the grid border.
//   3. BFS for path-existence from anchor 1; if the boss (anchor 10) isn't
//      reachable, regenerate.
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

import { Edge, RoomDef, RoomGridCoord, RoomOpening, RunMap } from './types';
import {
  ROOM_GRID_COLS,
  ROOM_GRID_ROWS,
  ANCHOR_COUNT,
  MIN_ANCHOR_SPACING,
  GRID_WIDTH,
  GRID_HEIGHT,
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

// The 10 anchors, from the existing levels. Walls are the authored interior
// with canonical doorways carved in; openings are derived from those carved
// walls. NPC/hut markers ride along so family/hut placeholders still render in
// anchor rooms. Statics are empty until Step 7 authors per-anchor manifests.
const ANCHOR_DEFS: RoomDef[] = levels.slice(0, ANCHOR_COUNT).map((lvl, i) => {
  const walls = carveAnchorDoors(lvl.walls);
  return {
    kind: 'anchor' as const,
    templateId: `anchor-${i + 1}`,
    anchorIndex: i,
    walls,
    openings: deriveOpenings(walls),
    candidates: [],
    authoredStatics: [],
    npcPositions: lvl.npcPositions,
    hutPositions: lvl.hutPositions,
  };
});

// The connector pool as RoomDefs. Shared by reference across every cell that
// uses the same template — they're read-only, so no per-cell copy is needed.
const CONNECTOR_DEFS: RoomDef[] = CONNECTOR_TEMPLATE_POOL.map((t) => ({
  kind: 'connector' as const,
  templateId: t.id,
  anchorIndex: null,
  walls: t.walls,
  openings: t.openings,
  candidates: t.candidates,
  authoredStatics: t.authoredStatics,
  npcPositions: [],
  hutPositions: [],
}));

// ───────────────────────────────────────────────────────────────────────────
// Anchor placement (Poisson-disk, interior only).
// ───────────────────────────────────────────────────────────────────────────
function tryPlaceAnchors(
  rng: () => number,
  minSpacing: number,
  maxAttempts: number,
): RoomGridCoord[] | null {
  const anchors: RoomGridCoord[] = [];
  let attempts = 0;
  while (anchors.length < ANCHOR_COUNT) {
    if (attempts++ > maxAttempts) return null;
    // Interior only (1..COLS-2 / 1..ROWS-2): keeps anchor openings off the
    // outer ring so they always face a neighbor cell, never off-map.
    const col = 1 + randInt(rng, ROOM_GRID_COLS - 2);
    const row = 1 + randInt(rng, ROOM_GRID_ROWS - 2);
    const coord = { col, row };
    if (anchors.some((a) => manhattan(a, coord) < minSpacing)) continue;
    anchors.push(coord);
  }
  return anchors;
}

function placeAnchors(rng: () => number): RoomGridCoord[] {
  // Try the target spacing, relaxing toward 1 if a sparse RNG run can't fit
  // all 10 (vanishingly rare with 405 interior cells).
  for (let spacing = MIN_ANCHOR_SPACING; spacing >= 1; spacing--) {
    const placed = tryPlaceAnchors(rng, spacing, 3000);
    if (placed) return placed;
  }
  // Deterministic last resort: a sparse interior lattice. Guarantees a result
  // so callers never have to handle a null placement.
  const out: RoomGridCoord[] = [];
  for (
    let row = 1;
    row < ROOM_GRID_ROWS - 1 && out.length < ANCHOR_COUNT;
    row += 2
  ) {
    for (
      let col = 1;
      col < ROOM_GRID_COLS - 1 && out.length < ANCHOR_COUNT;
      col += 3
    ) {
      out.push({ col, row });
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Connector fill.
// ───────────────────────────────────────────────────────────────────────────

// Reward for placing `def` at (col,row) given already-placed ANCHOR neighbors:
// strongly prefer connecting to an adjacent anchor's opening, and avoid opening
// into an adjacent anchor's wall. Connector neighbors are handled by the hard
// equality constraint, not here.
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
    if (!nb || nb.kind !== 'anchor') continue;
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
    const anchorCoords = placeAnchors(rng);

    const cells: (RoomDef | null)[][] = Array.from(
      { length: ROOM_GRID_ROWS },
      () =>
        Array.from({ length: ROOM_GRID_COLS }, () => null as RoomDef | null),
    );
    anchorCoords.forEach((coord, i) => {
      cells[coord.row][coord.col] = ANCHOR_DEFS[i];
    });
    fillConnectors(rng, cells);
    const filled = cells as RoomDef[][];

    const startCoord = anchorCoords[0];
    const bossCoord = anchorCoords[ANCHOR_COUNT - 1];
    last = {
      cols: ROOM_GRID_COLS,
      rows: ROOM_GRID_ROWS,
      cells: filled,
      anchorCoords,
      startCoord,
      bossCoord,
    };
    if (findPath(filled, startCoord, bossCoord)) return last;
  }

  // Essentially unreachable (P(200 disconnected fabrics) ≈ 0). Return the last
  // attempt so the game still runs; warn so it surfaces if it ever happens.
  console.warn('[Junar] generateRunMap: boss unreachable after max attempts');
  return last!;
}

// Look up the RoomDef at a grid coordinate.
export function roomAt(map: RunMap, coord: RoomGridCoord): RoomDef {
  return map.cells[coord.row][coord.col];
}

// ───────────────────────────────────────────────────────────────────────────
// Debug ASCII render (used by the generation harness / not shipped in the loop).
// Each room is a 3×3 block: centre glyph (S=start, B=boss, b–i=anchors 2–9,
// '.'=connector) framed by door marks on its open edges. Path rooms upper-cased
// to '*' centres when `markPath` is set.
// ───────────────────────────────────────────────────────────────────────────
export function renderRunMapAscii(map: RunMap, markPath = true): string {
  const path = markPath
    ? findPath(map.cells, map.startCoord, map.bossCoord)
    : null;
  const onPath = new Set((path ?? []).map((c) => cellKey(c.col, c.row)));

  const anchorGlyph = (def: RoomDef): string => {
    const i = def.anchorIndex ?? -1;
    if (i === 0) return 'S';
    if (i === ANCHOR_COUNT - 1) return 'B';
    return String.fromCharCode('a'.charCodeAt(0) + i); // b..i for anchors 2..9
  };

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
      let centre = def.kind === 'anchor' ? anchorGlyph(def) : '.';
      if (onPath.has(cellKey(col, row)) && def.kind === 'connector')
        centre = '*';
      r0.push(' ', n, ' ');
      r1.push(w, centre, e);
      r2.push(' ', s, ' ');
    }
    lines.push(r0.join(''), r1.join(''), r2.join(''));
  }
  return lines.join('\n');
}
