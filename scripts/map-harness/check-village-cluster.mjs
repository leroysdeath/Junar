// Village-cluster integrity audit. Over N seeds, verifies the generator places
// the village required room with its four inward-pointing arrow neighbours:
//   village N neighbour = arrow-s, S = arrow-n, W = arrow-e, E = arrow-w,
// each connecting to the village on the arrow side, and the village reachable
// from start. Exit 0 iff every seed is perfect.
//
// Usage: node scripts/map-harness/check-village-cluster.mjs [seeds]

import esbuild from 'esbuild';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outfile = path.join(os.tmpdir(), `junar-village-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [path.join(__dirname, 'entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const mod = await import(pathToFileURL(outfile).href);
fs.rmSync(outfile, { force: true });
const { generateRunMap, roomsConnect, roomAt, findPath, ROOM_GRID_COLS, ROOM_GRID_ROWS } =
  mod;

const SEEDS = Number(process.argv[2] ?? 2000);

// Expected arrow templateId in each village neighbour cell, + the village-edge it
// must connect across.
const EXPECT = [
  { edge: 'N', dc: 0, dr: -1, id: 'arrow-s' },
  { edge: 'S', dc: 0, dr: 1, id: 'arrow-n' },
  { edge: 'W', dc: -1, dr: 0, id: 'arrow-e' },
  { edge: 'E', dc: 1, dr: 0, id: 'arrow-w' },
];

let ok = 0;
const fails = [];
let villageReach = 0;
let arrowsReach = 0;
let arrowsTot = 0;

for (let s = 0; s < SEEDS; s++) {
  const map = generateRunMap(s);
  const v = map.villageCoord;
  let seedOk = true;
  const problems = [];

  if (!v) {
    fails.push(`seed ${s}: no villageCoord`);
    continue;
  }
  if (roomAt(map, v).templateId !== 'village') {
    problems.push(`village cell is ${roomAt(map, v).templateId}`);
    seedOk = false;
  }
  if (findPath(map.cells, map.startCoord, v) !== null) villageReach++;
  else {
    problems.push('village unreachable');
    seedOk = false;
  }

  for (const { edge, dc, dr, id } of EXPECT) {
    const nc = v.col + dc;
    const nr = v.row + dr;
    arrowsTot++;
    if (nc < 0 || nr < 0 || nc >= ROOM_GRID_COLS || nr >= ROOM_GRID_ROWS) {
      problems.push(`${edge} neighbour off-grid`);
      seedOk = false;
      continue;
    }
    const ndef = map.cells[nr][nc];
    if (ndef.templateId !== id) {
      problems.push(`${edge} neighbour is ${ndef.templateId}, want ${id}`);
      seedOk = false;
    }
    if (!roomsConnect(roomAt(map, v), edge, ndef)) {
      problems.push(`${edge} arrow does not connect to village`);
      seedOk = false;
    }
    if (findPath(map.cells, map.startCoord, { col: nc, row: nr }) !== null)
      arrowsReach++;
  }

  if (seedOk) ok++;
  else if (fails.length < 10) fails.push(`seed ${s}: ${problems.join('; ')}`);
}

console.log('═'.repeat(64));
console.log(`VILLAGE-CLUSTER AUDIT — ${SEEDS} seeds`);
console.log('═'.repeat(64));
console.log(`perfect clusters     : ${ok}/${SEEDS}`);
console.log(`village reachable    : ${villageReach}/${SEEDS}`);
console.log(`arrows reachable     : ${arrowsReach}/${arrowsTot}`);
if (fails.length) {
  console.log('\nsample failures:');
  for (const f of fails) console.log('  ' + f);
}
const pass = ok === SEEDS;
console.log('\n' + (pass ? '✓ PASS — every seed has a correct, reachable village cluster.' : '✗ FAIL'));
process.exit(pass ? 0 : 1);
