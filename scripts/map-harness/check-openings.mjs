// Map-generation opening-reciprocity audit (traversable-maps).
//
// The reachability gate in RoomGrid.generateRunMap only guarantees the REQUIRED
// rooms are reachable — it never checks that every individual opening reciprocates
// into a walkable neighbour opening. This harness does: over N seeds it generates
// the run map and, for every placed room / edge / boundary floor tile, checks that
// the tile directly across the border in the neighbour is ALSO floor. A floor tile
// whose counterpart is wall (or off-grid) is a "fake lane" — a walk-in pocket that
// reads as a doorway but leads nowhere.
//
// It prints a baseline (how bad it is today) plus a to-author list: the distinct
// (room, edge, opening-range) positions that fail, grouped so we know exactly which
// new connector mates to author and where forced placement is needed.
//
// Usage:  node scripts/map-harness/check-openings.mjs [seeds] [--worst] [--ascii=<seed>]
//   seeds      number of seeds to audit (default 2000; >=1000 is the bar)
//   --worst    print the ASCII render of the seed with the most fake lanes
//   --ascii=N  print the ASCII render of seed N
//
// Exit code: 0 if zero fake lanes across all seeds, 1 otherwise — so the same
// script doubles as a pass/fail regression gate once the fix lands.

import esbuild from 'esbuild';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(__dirname, 'entry.ts');
const outfile = path.join(os.tmpdir(), `junar-mapgen-${process.pid}.mjs`);

// ── Bundle the real generator (TS → node ESM) ───────────────────────────────
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const mod = await import(pathToFileURL(outfile).href);
fs.rmSync(outfile, { force: true });

const {
  generateRunMap,
  renderRunMapAscii,
  oppositeEdge,
  roomsConnect,
  findPath,
  GRID_WIDTH,
  GRID_HEIGHT,
  ROOM_GRID_COLS,
  ROOM_GRID_ROWS,
} = mod;

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const SEEDS = Number(args.find((a) => /^\d+$/.test(a)) ?? 2000);
const SHOW_WORST = args.includes('--worst');
const asciiArg = args.find((a) => a.startsWith('--ascii='));
const ASCII_SEED = asciiArg ? Number(asciiArg.split('=')[1]) : null;

// ── Edge geometry helpers ───────────────────────────────────────────────────
const EDGES = ['N', 'S', 'W', 'E'];
const DELTA = { N: [-1, 0], S: [1, 0], W: [0, -1], E: [0, 1] };

// Wall booleans along one edge of a room (length GRID_WIDTH for N/S, GRID_HEIGHT
// for W/E). Indexed by col for N/S, by row for W/E — the same axis the opposite
// edge uses, so tile index i aligns directly across the border.
function edgeLine(def, edge) {
  const w = def.walls;
  if (edge === 'N') return w[0];
  if (edge === 'S') return w[GRID_HEIGHT - 1];
  if (edge === 'W') return w.map((r) => r[0]);
  return w.map((r) => r[GRID_WIDTH - 1]); // E
}

function openingContaining(def, edge, i) {
  for (const o of def.openings) {
    if (o.edge === edge && o.rangeStart <= i && i <= o.rangeEnd) return o;
  }
  return null;
}

// All border floor tiles belonging to a room's openings, as [row,col].
function openingBorderTiles(def) {
  const tiles = [];
  for (const o of def.openings) {
    for (let i = o.rangeStart; i <= o.rangeEnd; i++) {
      if (o.edge === 'N') tiles.push([0, i]);
      else if (o.edge === 'S') tiles.push([GRID_HEIGHT - 1, i]);
      else if (o.edge === 'W') tiles.push([i, 0]);
      else tiles.push([i, GRID_WIDTH - 1]);
    }
  }
  return tiles;
}

// Flood the whole room grid from the start over roomsConnect adjacency; returns
// the set of reachable room cell-keys. Used to find walkable rooms that are
// nonetheless stranded (walled off) from the start area.
function reachableRoomKeys(map) {
  const { cells, startCoord } = map;
  const k = (c, r) => r * ROOM_GRID_COLS + c;
  const seen = new Set([k(startCoord.col, startCoord.row)]);
  const q = [startCoord];
  let h = 0;
  while (h < q.length) {
    const cur = q[h++];
    const def = cells[cur.row][cur.col];
    for (const edge of EDGES) {
      const [dr, dc] = DELTA[edge];
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      if (nc < 0 || nr < 0 || nc >= ROOM_GRID_COLS || nr >= ROOM_GRID_ROWS)
        continue;
      const nk = k(nc, nr);
      if (seen.has(nk)) continue;
      if (!roomsConnect(def, edge, cells[nr][nc])) continue;
      seen.add(nk);
      q.push({ col: nc, row: nr });
    }
  }
  return seen;
}

// True if every opening of a room is mutually reachable through its own floor —
// i.e. a player entering any door can walk to every other door. Rooms with <=1
// opening tile are trivially connected.
function intraConnected(def) {
  const seeds = openingBorderTiles(def);
  if (seeds.length <= 1) return true;
  const w = def.walls;
  const key = (r, c) => r * GRID_WIDTH + c;
  const seen = new Set([key(seeds[0][0], seeds[0][1])]);
  const stack = [seeds[0]];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= GRID_HEIGHT || nc >= GRID_WIDTH) continue;
      if (w[nr][nc]) continue; // wall
      const k = key(nr, nc);
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push([nr, nc]);
    }
  }
  return seeds.every(([r, c]) => seen.has(key(r, c)));
}

// ── Audit ─────────────────────────────────────────────────────────────────
const failOpenings = new Map(); // "tplId|edge|range" -> {count, ownerKind, edge, range, across:Map}
const failByOwnerKind = { connector: 0, anchor: 0, miniboss: 0 };
let totalFakeTiles = 0;
let seedsWithFail = 0;
let connToConn = 0; // both sides connectors (the closure problem)
let specialOwner = 0; // owner is anchor/miniboss (the adapter problem)
const perSeedFake = [];
let worstSeed = -1;
let worstCount = -1;

// Other invariants the fix must preserve.
let unreachableSeeds = 0; // a required room not reachable from start
let firstUnreachableSeed = -1;
let intraFailSeeds = 0; // a room whose openings aren't mutually reachable
let firstIntraFailSeed = -1;
let totalGrove = 0; // solid grove fallback rooms placed
let maxGrove = 0;
let genMs = 0; // generation wall-clock (regen-rate proxy)
// Whole-map reachability: walkable rooms (>=1 opening) reachable from start vs
// stranded (internally walkable but walled off from the start area).
let totalWalkable = 0;
let totalWalkableReachable = 0;
let totalStranded = 0;
let seedsWithStranded = 0;
let maxStranded = 0;
// Per-category reachability of the gameplay-significant rooms.
let bossReach = 0;
let minibossReach = 0;
let minibossTot = 0;
let mangoReach = 0;
let mangoTot = 0;
// Anchor hubs (former L1/L5/L9) — reclassified 2026-06-21 as defined-only
// multi-opening hubs (pulled from the random-fill pool), so they must NEVER
// appear in a generated map. Counted as a regression guard (expect 0).
let anchorHubPlacements = 0;
const ANCHOR_HUB_IDS = new Set(['anchor-1', 'anchor-5', 'anchor-9']);

function auditMap(map) {
  const cells = map.cells;
  let seedFake = 0;
  for (let row = 0; row < ROOM_GRID_ROWS; row++) {
    for (let col = 0; col < ROOM_GRID_COLS; col++) {
      const def = cells[row][col];
      for (const edge of EDGES) {
        const [dr, dc] = DELTA[edge];
        const nr = row + dr;
        const nc = col + dc;
        const inGrid = nr >= 0 && nc >= 0 && nr < ROOM_GRID_ROWS && nc < ROOM_GRID_COLS;
        const ndef = inGrid ? cells[nr][nc] : null;
        const line = edgeLine(def, edge);
        const nline = ndef ? edgeLine(ndef, oppositeEdge(edge)) : null;
        for (let i = 0; i < line.length; i++) {
          if (line[i]) continue; // wall — not an opening tile
          const neighbourWall = !ndef || nline[i];
          if (!neighbourWall) continue; // reciprocated — good
          // Fake lane: floor here, wall (or off-grid) across the border.
          seedFake++;
          totalFakeTiles++;
          failByOwnerKind[def.kind] = (failByOwnerKind[def.kind] ?? 0) + 1;
          if (def.kind === 'connector' && ndef && ndef.kind === 'connector') connToConn++;
          else specialOwner++;
          const o = openingContaining(def, edge, i);
          const range = o ? `${o.rangeStart}-${o.rangeEnd}` : `tile${i}`;
          const key = `${def.templateId}|${edge}|${range}`;
          let rec = failOpenings.get(key);
          if (!rec) {
            rec = { count: 0, ownerKind: def.kind, edge, range, across: new Map() };
            failOpenings.set(key, rec);
          }
          rec.count++;
          const ak = ndef ? `${ndef.kind}:${ndef.templateId}` : 'OFF-GRID';
          rec.across.set(ak, (rec.across.get(ak) ?? 0) + 1);
        }
      }
    }
  }
  return seedFake;
}

for (let s = 0; s < SEEDS; s++) {
  const t0 = Date.now();
  const map = generateRunMap(s);
  genMs += Date.now() - t0;

  const seedFake = auditMap(map);
  perSeedFake.push(seedFake);
  if (seedFake > 0) seedsWithFail++;
  if (seedFake > worstCount) {
    worstCount = seedFake;
    worstSeed = s;
  }

  // Required rooms still reachable from start (the gate's promise), counted
  // per category: boss, each mini-boss, each mango dead-end.
  const reach = (c) => findPath(map.cells, map.startCoord, c) !== null;
  let allReach = true;
  if (reach(map.bossCoord)) bossReach++;
  else allReach = false;
  for (const c of map.minibossCoords) {
    minibossTot++;
    if (reach(c)) minibossReach++;
    else allReach = false;
  }
  for (const c of map.mangoRoomCoords) {
    mangoTot++;
    if (reach(c)) mangoReach++;
    else allReach = false;
  }
  if (!allReach) {
    unreachableSeeds++;
    if (firstUnreachableSeed < 0) firstUnreachableSeed = s;
  }

  // Per-room internal connectivity + grove (solid-fallback) accounting +
  // whole-map reachability (walkable rooms stranded from the start area).
  const reachable = reachableRoomKeys(map);
  let groveThis = 0;
  let intraOk = true;
  let strandedThis = 0;
  for (let row = 0; row < ROOM_GRID_ROWS; row++) {
    for (let col = 0; col < ROOM_GRID_COLS; col++) {
      const def = map.cells[row][col];
      if (def.templateId === 'grove-solid') groveThis++;
      if (!intraConnected(def)) intraOk = false;
      const isReachable = reachable.has(row * ROOM_GRID_COLS + col);
      if (def.openings.length > 0) {
        totalWalkable++;
        if (isReachable) totalWalkableReachable++;
        else strandedThis++;
      }
      if (ANCHOR_HUB_IDS.has(def.templateId)) anchorHubPlacements++;
    }
  }
  totalGrove += groveThis;
  if (groveThis > maxGrove) maxGrove = groveThis;
  if (!intraOk) {
    intraFailSeeds++;
    if (firstIntraFailSeed < 0) firstIntraFailSeed = s;
  }
  totalStranded += strandedThis;
  if (strandedThis > 0) seedsWithStranded++;
  if (strandedThis > maxStranded) maxStranded = strandedThis;
}

// ── Report ──────────────────────────────────────────────────────────────────
const sorted = [...perSeedFake].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const mean = totalFakeTiles / SEEDS;
const pct = (n) => ((100 * n) / SEEDS).toFixed(1);

console.log('═'.repeat(72));
console.log(`OPENING-RECIPROCITY AUDIT — ${SEEDS} seeds (0..${SEEDS - 1})`);
console.log('═'.repeat(72));
console.log(`Seeds with >=1 fake lane : ${seedsWithFail} / ${SEEDS} (${pct(seedsWithFail)}%)`);
console.log(`Total fake-lane tiles    : ${totalFakeTiles}`);
console.log(`Fake lanes per map       : mean ${mean.toFixed(1)}  median ${median}  max ${worstCount} (seed ${worstSeed})`);
console.log('');
console.log('By owner room kind (the side that shows the fake opening):');
for (const k of ['connector', 'anchor', 'miniboss']) {
  console.log(`  ${k.padEnd(10)} ${failByOwnerKind[k] ?? 0}`);
}
console.log('');
console.log(`connector<->connector seams : ${connToConn}  (pool-closure problem)`);
console.log(`anchor/miniboss owner       : ${specialOwner}  (adapter problem)`);
console.log('');
console.log('Preserved-invariant checks:');
console.log(
  `  required rooms reachable : ${
    unreachableSeeds === 0
      ? 'all seeds OK'
      : `FAIL ${unreachableSeeds} seeds (first: ${firstUnreachableSeed})`
  }`,
);
console.log(`      boss ............. ${bossReach}/${SEEDS}`);
console.log(`      mini-bosses ...... ${minibossReach}/${minibossTot}`);
console.log(`      mango dead-ends .. ${mangoReach}/${mangoTot}`);
console.log(
  `  anchor hubs placed       : ${anchorHubPlacements} (expect 0 — defined-only since 2026-06-21)`,
);
console.log(
  `  intra-room connectivity  : ${
    intraFailSeeds === 0
      ? 'all rooms OK'
      : `FAIL ${intraFailSeeds} seeds (first: ${firstIntraFailSeed})`
  }`,
);
console.log(
  `  solid grove rooms / map  : mean ${(totalGrove / SEEDS).toFixed(2)}  max ${maxGrove}`,
);
console.log(
  `  generation time          : ${(genMs / SEEDS).toFixed(3)} ms/map (regen-rate proxy)`,
);
console.log(
  `  walkable rooms reachable : ${totalWalkableReachable}/${totalWalkable} (${(
    (100 * totalWalkableReachable) /
    totalWalkable
  ).toFixed(2)}%) from start`,
);
console.log(
  `  stranded walkable pockets: ${totalStranded} total, mean ${(totalStranded / SEEDS).toFixed(2)}/map, max ${maxStranded}, in ${seedsWithStranded} seeds`,
);

// To-author list: distinct failing (room, edge, range), most frequent first.
const list = [...failOpenings.entries()]
  .map(([key, rec]) => {
    const [tpl, edge, range] = key.split('|');
    const across = [...rec.across.entries()].sort((a, b) => b[1] - a[1]);
    return { tpl, edge, range, rec, across };
  })
  .sort((a, b) => b.rec.count - a.rec.count);

console.log('');
console.log('─'.repeat(72));
console.log('TO-AUTHOR LIST — distinct non-reciprocating openings');
console.log('(neededMate = a connector exposing this opening on the OPPOSITE edge,');
console.log(' force-placed across the border)');
console.log('─'.repeat(72));
console.log(
  `${'room (owner)'.padEnd(24)} ${'edge:range'.padEnd(11)} ${'kind'.padEnd(9)} ${'count'.padEnd(8)} neededMate  | top across`,
);
for (const { tpl, edge, range, rec, across } of list) {
  const needed = `${oppositeEdge(edge)}:${range}`;
  const top = across
    .slice(0, 3)
    .map(([k, n]) => `${k}×${n}`)
    .join(', ');
  console.log(
    `${tpl.padEnd(24)} ${`${edge}:${range}`.padEnd(11)} ${rec.ownerKind.padEnd(9)} ${String(rec.count).padEnd(8)} ${needed.padEnd(11)}| ${top}`,
  );
}

// Distinct needed-mate opening positions (the actual new-opening shapes to author).
const neededMates = new Map(); // "edge:range" -> Set(owner tpls)
for (const { tpl, edge, range } of list) {
  const k = `${oppositeEdge(edge)}:${range}`;
  if (!neededMates.has(k)) neededMates.set(k, new Set());
  neededMates.get(k).add(tpl);
}
console.log('');
console.log('─'.repeat(72));
console.log('DISTINCT NEEDED-MATE OPENING POSITIONS (one new connector edge each)');
console.log('─'.repeat(72));
for (const [k, owners] of [...neededMates.entries()].sort()) {
  console.log(`  ${k.padEnd(14)} <- needed by: ${[...owners].join(', ')}`);
}

if (SHOW_WORST && worstSeed >= 0) {
  console.log('');
  console.log(`─ Worst seed ${worstSeed} (${worstCount} fake lanes) ${'─'.repeat(30)}`);
  console.log(renderRunMapAscii(generateRunMap(worstSeed)));
}
if (ASCII_SEED != null) {
  console.log('');
  console.log(`─ Seed ${ASCII_SEED} ${'─'.repeat(40)}`);
  console.log(renderRunMapAscii(generateRunMap(ASCII_SEED)));
}

const pass =
  totalFakeTiles === 0 &&
  unreachableSeeds === 0 &&
  intraFailSeeds === 0 &&
  anchorHubPlacements === 0;
console.log('');
if (pass) {
  console.log('✓ PASS — zero fake lanes; required rooms reachable; rooms internally connected; no defined-only anchor hubs placed.');
} else {
  const reasons = [];
  if (totalFakeTiles > 0)
    reasons.push(`${totalFakeTiles} fake-lane tiles across ${seedsWithFail} seeds`);
  if (unreachableSeeds > 0) reasons.push(`${unreachableSeeds} seeds with an unreachable required room`);
  if (intraFailSeeds > 0) reasons.push(`${intraFailSeeds} seeds with an internally-split room`);
  if (anchorHubPlacements > 0)
    reasons.push(`${anchorHubPlacements} defined-only anchor hubs placed (should be 0)`);
  console.log(`✗ FAIL — ${reasons.join('; ')}.`);
}
process.exit(pass ? 0 : 1);
