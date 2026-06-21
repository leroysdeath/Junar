// Throwaway design harness for the "arrow / village" required-room cluster.
// Generates arrow-n / arrow-e / arrow-w from arrow-s + a geometric spec, renders
// them, and validates dims / canonical openings / internal connectivity, plus
// checks each arrow connects to the village on the village-facing edge.
//
// Usage: node scripts/map-harness/arrow-rooms.mjs

const W = 29;
const H = 17;

// ── Given maps ───────────────────────────────────────────────────────────────
const arrowS = [
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
];

const village = [
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
];

// ── Grid helpers ─────────────────────────────────────────────────────────────
const blank = () => Array.from({ length: H }, () => Array(W).fill(true)); // all wall

function toWalls(ascii) {
  return ascii.map((line) => [...line].map((ch) => ch === '#'));
}
function toAscii(walls) {
  return walls.map((row) => row.map((w) => (w ? '#' : '.')).join(''));
}
// open a rectangle [r0..r1] x [c0..c1]
function openRect(walls, r0, r1, c0, c1) {
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++)
      if (r >= 0 && r < H && c >= 0 && c < W) walls[r][c] = false;
}

// ── arrow-n : 180° rotation of arrow-s ───────────────────────────────────────
function rotate180(ascii) {
  return ascii.map((_, i) => [...ascii[H - 1 - i]].reverse().join(''));
}

// ── arrow-e : east-pointing chevron (hand-built) ─────────────────────────────
// Spine = full vertical corridor cols 13-15 (gives N & S). W stub rows 7-9 cols
// 0-12 (gives W). Arrowhead in cols 16-28 hangs off the spine, two 3-row-thick
// legs at a 2:1 slope converging to the E exit (rows 7-9, col 28).

// ── Left-right mirror (used to derive arrow-e from the owner-authored arrow-w)
function mirrorLR(walls) {
  return walls.map((row) => [...row].reverse());
}

// ── Openings (N,S,W,E) derived from geometry ─────────────────────────────────
function runs(isOpen, len) {
  const out = [];
  let start = -1;
  for (let i = 0; i < len; i++) {
    if (isOpen(i)) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      out.push([start, i - 1]);
      start = -1;
    }
  }
  if (start !== -1) out.push([start, len - 1]);
  return out;
}
function openings(walls) {
  return {
    N: runs((c) => !walls[0][c], W),
    S: runs((c) => !walls[H - 1][c], W),
    W: runs((r) => !walls[r][0], H),
    E: runs((r) => !walls[r][W - 1], H),
  };
}
const CANON = {
  N: [[13, 15]],
  S: [[13, 15]],
  W: [[7, 9]],
  E: [[7, 9]],
};
function fmtOpen(o) {
  return Object.entries(o)
    .map(([e, rs]) => `${e}:${rs.map((r) => r.join('-')).join(',') || '—'}`)
    .join('  ');
}
function isCanonical(o) {
  return ['N', 'S', 'W', 'E'].every(
    (e) => JSON.stringify(o[e]) === JSON.stringify(CANON[e]),
  );
}

// ── Internal connectivity: every opening tile mutually reachable ─────────────
function openingTiles(o) {
  const tiles = [];
  for (const [s, e] of o.N) for (let i = s; i <= e; i++) tiles.push([0, i]);
  for (const [s, e] of o.S) for (let i = s; i <= e; i++) tiles.push([H - 1, i]);
  for (const [s, e] of o.W) for (let i = s; i <= e; i++) tiles.push([i, 0]);
  for (const [s, e] of o.E) for (let i = s; i <= e; i++) tiles.push([i, W - 1]);
  return tiles;
}
function intraConnected(walls, o) {
  const tiles = openingTiles(o);
  if (tiles.length <= 1) return true;
  const key = (r, c) => r * W + c;
  const seen = new Set([key(...tiles[0])]);
  const stack = [tiles[0]];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
      if (walls[nr][nc]) continue;
      const k = key(nr, nc);
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push([nr, nc]);
    }
  }
  return tiles.every(([r, c]) => seen.has(key(r, c)));
}

// Count disconnected open regions (sanity: should be 1).
function openRegions(walls) {
  const seen = new Set();
  const key = (r, c) => r * W + c;
  let regions = 0;
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      if (walls[r][c] || seen.has(key(r, c))) continue;
      regions++;
      const stack = [[r, c]];
      seen.add(key(r, c));
      while (stack.length) {
        const [cr, cc] = stack.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
          if (walls[nr][nc] || seen.has(key(nr, nc))) continue;
          seen.add(key(nr, nc));
          stack.push([nr, nc]);
        }
      }
    }
  return regions;
}

// ── Pretty render: █ wall, · floor ───────────────────────────────────────────
function render(walls) {
  return walls
    .map((row) => row.map((w) => (w ? '█' : '·')).join(''))
    .join('\n');
}

// ── overlap check between two rooms on an edge ───────────────────────────────
function overlaps(a, b) {
  return a[0] <= b[1] && b[0] <= a[1];
}
function connects(o1, edge, o2) {
  const opp = { N: 'S', S: 'N', E: 'W', W: 'E' }[edge];
  return o1[edge].some((x) => o2[opp].some((y) => overlaps(x, y)));
}

// ── Build + validate everything ──────────────────────────────────────────────
// Owner-authored arrow-w (west-pointing). arrow-e = its left-right mirror
// (east-pointing). A literal 90° turn would change the room to 17×29 and point
// it N/S; the mirror is what yields a valid east arrow on a 29×17 grid.
const arrowW = [
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
];

const rooms = {
  'arrow-s': toWalls(arrowS),
  'arrow-n': toWalls(rotate180(arrowS)),
  'arrow-w': toWalls(arrowW),
  'arrow-e': mirrorLR(toWalls(arrowW)),
  village: toWalls(village),
};

let allOk = true;
for (const [name, walls] of Object.entries(rooms)) {
  const o = openings(walls);
  const dimsOk = walls.length === H && walls.every((r) => r.length === W);
  const canon = isCanonical(o);
  const intra = intraConnected(walls, o);
  const regions = openRegions(walls);
  const ok = dimsOk && canon && intra && regions === 1;
  if (!ok) allOk = false;
  console.log('═'.repeat(60));
  console.log(
    `${name}   dims:${dimsOk ? 'OK' : 'BAD'}  canonical:${canon ? 'YES' : 'no'}  intra:${intra ? 'OK' : 'SPLIT'}  regions:${regions}`,
  );
  console.log('  openings  ' + fmtOpen(o));
  console.log(render(walls));
}

console.log('═'.repeat(60));
console.log('CLUSTER CONNECTIVITY (arrow must connect to village on arrow side):');
const ov = openings(rooms.village);
for (const [name, side] of [
  ['arrow-s', 'S'], // arrow-s sits N of village, its S meets village N
  ['arrow-n', 'N'],
  ['arrow-e', 'E'],
  ['arrow-w', 'W'],
]) {
  const oa = openings(rooms[name]);
  const ok = connects(oa, side, ov);
  console.log(`  ${name} ${side}-edge ↔ village : ${ok ? 'CONNECTS' : 'NO'}`);
  if (!ok) allOk = false;
}

console.log('═'.repeat(60));
console.log(allOk ? '✓ ALL VALID' : '✗ PROBLEMS FOUND');

// Emit the final ASCII arrays (copy-paste ready) for the 3 new rooms.
for (const name of ['arrow-n', 'arrow-e', 'arrow-w']) {
  console.log(`\n// ${name}`);
  console.log('[');
  for (const line of toAscii(rooms[name])) console.log(`  '${line}',`);
  console.log('],');
}
