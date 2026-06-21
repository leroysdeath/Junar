// Render sample run maps to high-res PNGs (dev tooling — not shipped).
//
// Bundles the REAL room-grid generator (via esbuild, exactly like
// check-openings.mjs) and paints each generated RunMap to a PNG: tree-wall /
// dirt-floor tiles, special-room markers (start / boss / mini-bosses), the
// start->boss BFS path, and a mango glyph at every mango dead-end's exact tile
// (RunMap.mangoRoomCoords x MANGO_TILE_BY_TEMPLATE). PNG is encoded with the
// built-in zlib — no new dependencies, Tauri-safe.
//
// Usage:  node scripts/map-harness/render-maps.mjs [seed ...]
//   seeds   one or more numeric seeds to render (default: 1..10)
// Output:  sample-maps/sample-map-seed-NN.png  (one file per seed)

import esbuild from 'esbuild';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const entry = path.join(__dirname, 'render-entry.ts');
const outfile = path.join(os.tmpdir(), `junar-rendermaps-${process.pid}.mjs`);

// ── Bundle the real generator (TS -> node ESM) ──────────────────────────────
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
  findPath,
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  ROOM_GRID_COLS,
  ROOM_GRID_ROWS,
  MANGO_TILE_BY_TEMPLATE,
} = mod;

// ── Args ─────────────────────────────────────────────────────────────────────
const seedArgs = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const seeds = seedArgs.length ? seedArgs : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ── Render geometry ──────────────────────────────────────────────────────────
const TILE_PX = 5; // on-screen px per in-room tile
const ROOM_W = GRID_WIDTH * TILE_PX; // 145
const ROOM_H = GRID_HEIGHT * TILE_PX; // 85
const MAP_W = ROOM_GRID_COLS * ROOM_W; // 4205
const MAP_H = ROOM_GRID_ROWS * ROOM_H; // 1445
const MARGIN = 22;
const HEAD = 142; // header band height
const W = MAP_W + MARGIN * 2;
const H = HEAD + MAP_H + MARGIN;
const MAP_X = MARGIN;
const MAP_Y = HEAD;

// ── Palette ([r,g,b]) ────────────────────────────────────────────────────────
const C = {
  bg: [14, 18, 12],
  headBg: [22, 28, 18],
  tree: [34, 48, 24], // jungle tree wall
  treeEdge: [44, 60, 32], // subtle wall top-highlight
  dirt: [184, 153, 104], // dirt floor
  start: [39, 211, 211], // cyan
  boss: [255, 57, 176], // magenta
  growth: [154, 205, 50], // goo-green stump (GOO_HEART)
  panther: [255, 64, 64], // red
  mini: [255, 140, 26], // orange (empty mini-bosses)
  mangoFrame: [255, 210, 77], // gold (mango dead-end frame)
  mango: [255, 111, 0], // mango body (FF6F00)
  mangoHi: [255, 196, 77],
  leaf: [107, 142, 35],
  pathLine: [255, 240, 77], // start->boss route
  white: [240, 240, 235],
  ink: [12, 14, 10],
  text: [214, 222, 200],
  textDim: [150, 165, 135],
};

// ── RGB framebuffer + primitives ─────────────────────────────────────────────
const buf = Buffer.alloc(W * H * 3);
function clearTo(c) {
  for (let i = 0; i < W * H; i++) {
    buf[i * 3] = c[0];
    buf[i * 3 + 1] = c[1];
    buf[i * 3 + 2] = c[2];
  }
}
function px(x, y, c) {
  x |= 0;
  y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}
function rect(x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) px(xx, yy, c);
}
function frame(x, y, w, h, t, c) {
  rect(x, y, w, t, c);
  rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c);
  rect(x + w - t, y, t, h, c);
}
const blend = (a, b, t) => [
  Math.round(a[0] * (1 - t) + b[0] * t),
  Math.round(a[1] * (1 - t) + b[1] * t),
  Math.round(a[2] * (1 - t) + b[2] * t),
];
function disc(cx, cy, r, c) {
  const r2 = r * r;
  for (let yy = -r; yy <= r; yy++)
    for (let xx = -r; xx <= r; xx++)
      if (xx * xx + yy * yy <= r2) px(cx + xx, cy + yy, c);
}
function ring(cx, cy, r, c) {
  const ro = r * r;
  const ri = (r - 1) * (r - 1);
  for (let yy = -r; yy <= r; yy++)
    for (let xx = -r; xx <= r; xx++) {
      const d = xx * xx + yy * yy;
      if (d <= ro && d >= ri) px(cx + xx, cy + yy, c);
    }
}
function thickLine(x0, y0, x1, y1, c, th) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const r = (th / 2) | 0;
  while (true) {
    disc(x0, y0, r, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

// ── 5x7 bitmap font (uppercase + digits + a few symbols) ─────────────────────
const G = (rows) => rows;
const FONT = {
  ' ': G(['     ', '     ', '     ', '     ', '     ', '     ', '     ']),
  '-': G(['     ', '     ', '     ', '#####', '     ', '     ', '     ']),
  '.': G(['     ', '     ', '     ', '     ', '     ', ' ##  ', ' ##  ']),
  ',': G(['     ', '     ', '     ', '     ', ' ##  ', ' ##  ', '#    ']),
  ':': G(['     ', ' ##  ', ' ##  ', '     ', ' ##  ', ' ##  ', '     ']),
  '/': G(['    #', '    #', '   # ', '  #  ', ' #   ', '#    ', '#    ']),
  '(': G(['   # ', '  #  ', ' #   ', ' #   ', ' #   ', '  #  ', '   # ']),
  ')': G([' #   ', '  #  ', '   # ', '   # ', '   # ', '  #  ', ' #   ']),
  '#': G([' # # ', ' # # ', '#####', ' # # ', '#####', ' # # ', ' # # ']),
  '×': G(['     ', '     ', '#   #', ' # # ', '  #  ', ' # # ', '#   #']),
  A: G([' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #']),
  B: G(['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### ']),
  C: G([' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### ']),
  D: G(['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### ']),
  E: G(['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####']),
  F: G(['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    ']),
  G: G([' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ### ']),
  H: G(['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #']),
  I: G(['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '#####']),
  J: G(['#####', '   # ', '   # ', '   # ', '   # ', '#  # ', ' ##  ']),
  K: G(['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #']),
  L: G(['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####']),
  M: G(['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #']),
  N: G(['#   #', '##  #', '# # #', '# # #', '#  ##', '#   #', '#   #']),
  O: G([' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### ']),
  P: G(['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    ']),
  Q: G([' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #']),
  R: G(['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #']),
  S: G([' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### ']),
  T: G(['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ']),
  U: G(['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### ']),
  V: G(['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  ']),
  W: G(['#   #', '#   #', '#   #', '# # #', '# # #', '## ##', '#   #']),
  X: G(['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #']),
  Y: G(['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  ']),
  Z: G(['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####']),
  0: G([' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### ']),
  1: G(['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### ']),
  2: G([' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####']),
  3: G(['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### ']),
  4: G(['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # ']),
  5: G(['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### ']),
  6: G([' ### ', '#    ', '#    ', '#### ', '#   #', '#   #', ' ### ']),
  7: G(['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   ']),
  8: G([' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### ']),
  9: G([' ### ', '#   #', '#   #', ' ####', '    #', '    #', ' ### ']),
};
function glyphWidth(scale) {
  return 5 * scale + scale; // 5 cols + 1 col spacing
}
function drawText(x, y, str, scale, c, outline) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] !== '#') continue;
        const bx = cx + col * scale;
        const by = y + r * scale;
        if (outline) {
          // 4-neighbour halo for legibility over busy backgrounds
          rect(bx - scale, by, scale, scale, outline);
          rect(bx + scale, by, scale, scale, outline);
          rect(bx, by - scale, scale, scale, outline);
          rect(bx, by + scale, scale, scale, outline);
        }
      }
    }
    cx += glyphWidth(scale);
  }
  // second pass draws the glyph fill over the halo
  cx = x;
  for (const ch of str.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === '#') rect(cx + col * scale, y + r * scale, scale, scale, c);
    cx += glyphWidth(scale);
  }
  return cx - x;
}
function textWidth(str, scale) {
  return str.length * glyphWidth(scale);
}

// ── PNG encoder (RGB, color type 2) via built-in zlib ────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Map -> framebuffer ───────────────────────────────────────────────────────
const sameCoord = (a, b) => a && b && a.col === b.col && a.row === b.row;
const roomOriginX = (col) => MAP_X + col * ROOM_W;
const roomOriginY = (row) => MAP_Y + row * ROOM_H;
const roomCenterX = (col) => roomOriginX(col) + ROOM_W / 2;
const roomCenterY = (row) => roomOriginY(row) + ROOM_H / 2;

function drawMango(cx, cy) {
  const r = Math.round(TILE_PX * 1.7);
  ring(cx, cy, r + 2, C.ink); // dark halo so it pops on gold floor
  disc(cx, cy, r, C.mango);
  disc(cx - Math.round(r * 0.35), cy - Math.round(r * 0.35), Math.max(1, (r * 0.4) | 0), C.mangoHi);
  // leaf at upper-right
  rect(cx + Math.round(r * 0.4), cy - r - 2, Math.max(2, (r * 0.7) | 0), Math.max(2, (r * 0.5) | 0), C.leaf);
}

function renderMap(map, seed) {
  clearTo(C.bg);
  rect(0, 0, W, HEAD, C.headBg);

  // Per-room role lookup.
  const mangoSet = new Set(map.mangoRoomCoords.map((c) => c.row * 1000 + c.col));
  const miniSet = new Set(map.minibossCoords.map((c) => c.row * 1000 + c.col));
  const key = (col, row) => row * 1000 + col;

  // Boss stump tile (centre of the 3x3 growth), from world-px centre.
  const stumpCol = Math.round((map.bossStumpCenter.x - TILE_SIZE / 2) / TILE_SIZE);
  const stumpRow = Math.round((map.bossStumpCenter.y - TILE_SIZE / 2) / TILE_SIZE);

  // 1) Tiles: dirt floor + tree walls, with a faint special-floor tint.
  for (let rr = 0; rr < ROOM_GRID_ROWS; rr++) {
    for (let cc = 0; cc < ROOM_GRID_COLS; cc++) {
      const def = map.cells[rr][cc];
      const ox = roomOriginX(cc);
      const oy = roomOriginY(rr);
      const isStart = sameCoord({ col: cc, row: rr }, map.startCoord);
      const isBoss = sameCoord({ col: cc, row: rr }, map.bossCoord);
      const isPanther = sameCoord({ col: cc, row: rr }, map.pantherBossCoord);
      const isMini = miniSet.has(key(cc, rr));
      const isMango = mangoSet.has(key(cc, rr));
      let floor = C.dirt;
      if (isStart) floor = blend(C.dirt, C.start, 0.22);
      else if (isBoss) floor = blend(C.dirt, C.boss, 0.2);
      else if (isPanther) floor = blend(C.dirt, C.panther, 0.2);
      else if (isMini) floor = blend(C.dirt, C.mini, 0.18);
      else if (isMango) floor = blend(C.dirt, C.mangoFrame, 0.16);

      for (let r = 0; r < GRID_HEIGHT; r++) {
        for (let c = 0; c < GRID_WIDTH; c++) {
          const x = ox + c * TILE_PX;
          const y = oy + r * TILE_PX;
          if (def.walls[r][c]) {
            // Boss growth: colour the 3x3 stump goo-green.
            const isStump =
              isBoss && Math.abs(c - stumpCol) <= 1 && Math.abs(r - stumpRow) <= 1;
            rect(x, y, TILE_PX, TILE_PX, isStump ? C.growth : C.tree);
            // subtle top highlight where a wall sits above floor
            if (!isStump && r > 0 && !def.walls[r - 1][c])
              rect(x, y, TILE_PX, 1, C.treeEdge);
          } else {
            rect(x, y, TILE_PX, TILE_PX, floor);
          }
        }
      }
    }
  }

  // 2) start -> boss route (drawn over tiles, under markers/mangos).
  const route = findPath(map.cells, map.startCoord, map.bossCoord);
  if (route) {
    for (let i = 1; i < route.length; i++) {
      thickLine(
        roomCenterX(route[i - 1].col),
        roomCenterY(route[i - 1].row),
        roomCenterX(route[i].col),
        roomCenterY(route[i].row),
        C.pathLine,
        4,
      );
    }
  }

  // 3) Special-room frames + centre marker discs.
  function markRoom(col, row, color, letter) {
    const ox = roomOriginX(col);
    const oy = roomOriginY(row);
    frame(ox + 1, oy + 1, ROOM_W - 2, ROOM_H - 2, 2, color);
    const cx = (roomCenterX(col)) | 0;
    const cy = (roomCenterY(row)) | 0;
    const r = 13;
    disc(cx, cy, r, C.ink);
    disc(cx, cy, r - 2, color);
    const s = 2;
    const tw = textWidth(letter, s) - s; // trim trailing spacing
    drawText(cx - (tw >> 1) - 1, cy - 7, letter, s, C.white, C.ink);
  }
  for (const c of map.minibossCoords) {
    const isP = sameCoord(c, map.pantherBossCoord);
    markRoom(c.col, c.row, isP ? C.panther : C.mini, isP ? 'P' : 'M');
  }
  markRoom(map.startCoord.col, map.startCoord.row, C.start, 'S');
  markRoom(map.bossCoord.col, map.bossCoord.row, C.boss, 'B');

  // 4) Mango glyphs at each mango dead-end's exact tile.
  for (const c of map.mangoRoomCoords) {
    const def = map.cells[c.row][c.col];
    const tile = MANGO_TILE_BY_TEMPLATE[def.templateId];
    if (!tile) continue;
    const tc = tile.x / TILE_SIZE;
    const tr = tile.y / TILE_SIZE;
    const ox = roomOriginX(c.col);
    const oy = roomOriginY(c.row);
    frame(ox + 1, oy + 1, ROOM_W - 2, ROOM_H - 2, 2, C.mangoFrame);
    drawMango(
      (ox + (tc + 0.5) * TILE_PX) | 0,
      (oy + (tr + 0.5) * TILE_PX) | 0,
    );
  }

  // 5) Header: title, stats, legend.
  drawText(MARGIN, 14, `JUNGLE X  -  SAMPLE MAP  SEED ${seed}`, 4, C.text);
  const mangoCount = map.mangoRoomCoords.length;
  const stats = `${ROOM_GRID_COLS}×${ROOM_GRID_ROWS} ROOMS   ${GRID_WIDTH}×${GRID_HEIGHT} TILES/ROOM   MANGOS ${mangoCount}   ROUTE TO BOSS ${route ? route.length : 0} ROOMS`;
  drawText(MARGIN, 58, stats, 2, C.textDim);

  // Legend row: swatch + label.
  const legend = [
    [C.start, 'START'],
    [C.boss, 'BOSS'],
    [C.growth, 'GROWTH (WIN)'],
    [C.panther, 'PANTHER BOSS'],
    [C.mini, 'MINI-BOSS'],
    [C.mango, 'MANGO ×5'],
    [C.pathLine, 'ROUTE TO BOSS'],
  ];
  let lx = MARGIN;
  const ly = 96;
  const sw = 22;
  for (const [color, label] of legend) {
    rect(lx, ly, sw, sw, color);
    frame(lx, ly, sw, sw, 1, C.ink);
    drawText(lx + sw + 8, ly + 1, label, 2, C.text);
    lx += sw + 8 + textWidth(label, 2) + 34;
  }

  return encodePNG(W, H, buf);
}

// ── Drive ────────────────────────────────────────────────────────────────────
const outDir = path.join(projectRoot, 'sample-maps');
fs.mkdirSync(outDir, { recursive: true });
console.log(`Rendering ${seeds.length} maps -> ${outDir}  (${W}×${H}px each)`);
for (const seed of seeds) {
  const map = generateRunMap(seed);
  const png = renderMap(map, seed);
  const name = `sample-map-seed-${String(seed).padStart(2, '0')}.png`;
  fs.writeFileSync(path.join(outDir, name), png);
  const mango = map.mangoRoomCoords
    .map((c) => `(${c.col},${c.row})`)
    .join(' ');
  const minis = map.minibossCoords
    .map((c) => {
      const tag = c.col === map.pantherBossCoord.col && c.row === map.pantherBossCoord.row ? 'P' : 'M';
      return `${tag}:${map.cells[c.row][c.col].templateId}`;
    })
    .join(' ');
  console.log(
    `  ${name}  ${Math.round(png.length / 1024)}KB  start(${map.startCoord.col},${map.startCoord.row}) boss(${map.bossCoord.col},${map.bossCoord.row})/${map.cells[map.bossCoord.row][map.bossCoord.col].templateId} mangos ${mango}`,
  );
  console.log(`       mini-bosses: ${minis}`);
}
console.log('Done.');
