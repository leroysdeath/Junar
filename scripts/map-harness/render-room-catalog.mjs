// Render a single reference sheet of EVERY room template the generator defines
// (dev tooling — not shipped). Bundles the real RoomTemplates pools + RoomGrid
// debug defs (via esbuild) and lays out one labeled thumbnail per room:
//
//   • Fabric connectors (random-fill pool) — straights / L-bends / T-junctions /
//     cross / maze-chicane   (mango dead-ends excluded by request)
//   • Adapter connectors — snake/gibbon links (force-placed) + hubs/forks
//     (defined but not currently placed)
//   • Anchor hub connectors (ex-levels 1/5/9, carved + completed off-centre
//     pathways → multi-opening hubs; defined-only, not random-placed)
//   • Grove (solid fallback)
//   • Boss arenas (required · 4 versions, green win-stump)
//   • Mini-boss arenas (required · 4 active + 5 saved alternates)
//
// Output: sample-maps/room-catalog.png   (one image, walls + floor + labels)

import esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Canvas } from './png-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const entry = path.join(__dirname, 'render-entry.ts');
const outfile = path.join(os.tmpdir(), `junar-catalog-${process.pid}.mjs`);

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
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  FABRIC_TEMPLATE_POOL,
  ADAPTER_TEMPLATE_POOL,
  ANCHOR_HUB_DEFS,
  GROVE_DEF,
  BOSS_VERSIONS,
  MINIBOSS_DEFS,
} = mod;

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: [14, 18, 12],
  titleBg: [22, 28, 18],
  tree: [34, 48, 24],
  treeEdge: [44, 60, 32],
  dirt: [184, 153, 104],
  growth: [154, 205, 50],
  text: [222, 230, 208],
  dim: [150, 165, 135],
  fabric: [126, 200, 80],
  adapter: [63, 182, 200],
  adapterDim: [96, 132, 140],
  anchor: [170, 120, 214],
  grove: [128, 128, 112],
  boss: [255, 88, 188],
  mini: [255, 150, 40],
  miniAlt: [168, 124, 70],
  panther: [255, 80, 80],
};

// ── Geometry ─────────────────────────────────────────────────────────────────
const TILE_PX = 7;
const ROOM_W = GRID_WIDTH * TILE_PX; // 203
const ROOM_H = GRID_HEIGHT * TILE_PX; // 119
const COLS = 7;
const GAP_X = 14;
const LABEL_H = 38;
const ROW_GAP = 16;
const ROW_H = ROOM_H + LABEL_H + ROW_GAP;
const HEADER_H = 46;
const SECTION_GAP = 14;
const MARGIN = 28;
const TITLE_H = 122;
const GRID_W = COLS * ROOM_W + (COLS - 1) * GAP_X;
const W = GRID_W + MARGIN * 2;

// ── Label maps ───────────────────────────────────────────────────────────────
const NAME = {
  't-straight-ew': 'STRAIGHT-EW', 't-straight-ns': 'STRAIGHT-NS',
  't-lbend-ne': 'LBEND-NE', 't-lbend-nw': 'LBEND-NW',
  't-lbend-se': 'LBEND-SE', 't-lbend-sw': 'LBEND-SW',
  't-tjunc-open-n': 'TJUNC-N', 't-tjunc-open-s': 'TJUNC-S',
  't-tjunc-open-e': 'TJUNC-E', 't-tjunc-open-w': 'TJUNC-W',
  't-cross': 'CROSS', 't-maze-chicane-ew': 'MAZE-CHICANE',
  't-diamond-ns': 'DIAMOND-NS', 't-diamond-cross': 'DIAMOND-X',
  't-grotto-fork-n': 'GROTTO-FORK', 't-cleft-cross': 'CLEFT-X',
  't-multiopen-double-n': 'HUB-N', 't-multiopen-double-s': 'HUB-S',
  't-multiopen-double-e': 'HUB-E', 't-multiopen-double-w': 'HUB-W',
  't-multiopen-fork-n': 'FORK-N', 't-multiopen-fork-e': 'FORK-E',
  't-multiopen-fork-s': 'FORK-S', 't-multiopen-fork-w': 'FORK-W',
  't-snake-link-n': 'SNAKE-LINK-N', 't-snake-link-s': 'SNAKE-LINK-S',
  't-snake-link-e': 'SNAKE-LINK-E', 't-snake-link-w': 'SNAKE-LINK-W',
  't-gibbon-link-n': 'GIBBON-LINK-N', 't-gibbon-link-s': 'GIBBON-LINK-S',
  'anchor-1': 'ANCHOR-1', 'anchor-5': 'ANCHOR-5', 'anchor-9': 'ANCHOR-9',
};
const nm = (id) => NAME[id] ?? id.toUpperCase();

const MB_LABEL = {
  emptyThrone: ['EMPTY-THRONE', 'PANTHER'],
  bear: ['BEAR', 'EMPTY'], snake: ['SNAKE', 'EMPTY'], gibbon: ['GIBBON', 'EMPTY'],
  emptyThroneAlt: ['THRONE-ALT', 'ALT'], motherStump: ['MOTHER-STUMP', 'ALT'],
  bearAlt: ['BEAR-OCTAGON', 'ALT'], snakeAlt: ['SNAKE-ALT', 'ALT'],
  snakeAlt2: ['SNAKE-ALT2', 'ALT'],
};
const ACTIVE_KEYS = new Set(['emptyThrone', 'bear', 'snake', 'gibbon']);
const L_BENDS = new Set(['t-lbend-ne', 't-lbend-nw', 't-lbend-se', 't-lbend-sw']);
const DEADENDS = new Set(['t-deadend-n', 't-deadend-s', 't-deadend-e', 't-deadend-w']);
const EX_LEVEL = { 'anchor-1': 'EX-L1', 'anchor-5': 'EX-L5', 'anchor-9': 'EX-L9' };

// ── Build the item list per section ──────────────────────────────────────────
const fabricItems = FABRIC_TEMPLATE_POOL.filter((t) => !DEADENDS.has(t.id)).map(
  (t) => ({ walls: t.walls, name: nm(t.id), note: L_BENDS.has(t.id) ? 'START' : '', frame: C.fabric }),
);
const adapterItems = ADAPTER_TEMPLATE_POOL.map((t) => {
  const isLink = t.id.includes('-link-');
  return { walls: t.walls, name: nm(t.id), note: isLink ? 'PLACED' : 'UNPLACED', frame: isLink ? C.adapter : C.adapterDim };
});
const anchorItems = ANCHOR_HUB_DEFS.map((d) => ({
  walls: d.walls, name: nm(d.templateId), note: EX_LEVEL[d.templateId] ?? '', frame: C.anchor,
}));
const groveItems = [{ walls: GROVE_DEF.walls, name: 'GROVE', note: 'FALLBACK', frame: C.grove }];
const bossItems = BOSS_VERSIONS.map((v) => {
  const col = Math.round((v.stumpCenter.x - TILE_SIZE / 2) / TILE_SIZE);
  const row = Math.round((v.stumpCenter.y - TILE_SIZE / 2) / TILE_SIZE);
  const stump = new Set();
  for (let r = row - 1; r <= row + 1; r++) for (let c = col - 1; c <= col + 1; c++) stump.add(r * 100 + c);
  return { walls: v.def.walls, name: v.def.templateId.toUpperCase(), note: 'WIN', frame: C.boss, stump };
});
const mbItems = [...MINIBOSS_DEFS]
  .sort((a, b) => (ACTIVE_KEYS.has(b.key) ? 1 : 0) - (ACTIVE_KEYS.has(a.key) ? 1 : 0))
  .map(({ key, def }) => {
    const [name, note] = MB_LABEL[key] ?? [def.templateId.toUpperCase(), ''];
    const frame = key === 'emptyThrone' ? C.panther : ACTIVE_KEYS.has(key) ? C.mini : C.miniAlt;
    return { walls: def.walls, name, note, frame };
  });

const sections = [
  { title: 'FABRIC CONNECTORS — RANDOM-FILL POOL', cat: C.fabric, items: fabricItems },
  { title: 'ADAPTER CONNECTORS — LINKS FORCE-PLACED · HUBS/FORKS DEFINED-ONLY', cat: C.adapter, items: adapterItems },
  { title: 'ANCHOR HUB CONNECTORS — DEFINED-ONLY · MULTI-OPENING  (EX-LEVELS 1 / 5 / 9)', cat: C.anchor, items: anchorItems },
  { title: 'GROVE — SOLID FALLBACK', cat: C.grove, items: groveItems },
  { title: 'BOSS ARENAS — REQUIRED · TOUCH GREEN STUMP TO WIN', cat: C.boss, items: bossItems },
  { title: 'MINI-BOSS ARENAS — REQUIRED · 4 ACTIVE + 5 SAVED ALTS', cat: C.mini, items: mbItems },
];

// ── Compute height, allocate canvas ──────────────────────────────────────────
let H = TITLE_H + MARGIN;
for (const s of sections) {
  H += SECTION_GAP + HEADER_H + Math.ceil(s.items.length / COLS) * ROW_H;
}
const total = sections.reduce((n, s) => n + s.items.length, 0);
const cv = new Canvas(W, H, C.bg);

// ── Draw a room thumbnail at (x,y) ───────────────────────────────────────────
function drawRoom(x, y, walls, frameColor, stump) {
  for (let r = 0; r < GRID_HEIGHT; r++) {
    for (let c = 0; c < GRID_WIDTH; c++) {
      const px = x + c * TILE_PX;
      const py = y + r * TILE_PX;
      if (walls[r][c]) {
        const isStump = stump && stump.has(r * 100 + c);
        cv.rect(px, py, TILE_PX, TILE_PX, isStump ? C.growth : C.tree);
        if (!isStump && r > 0 && !walls[r - 1][c]) cv.rect(px, py, TILE_PX, 1, C.treeEdge);
      } else {
        cv.rect(px, py, TILE_PX, TILE_PX, C.dirt);
      }
    }
  }
  cv.frame(x - 2, y - 2, ROOM_W + 4, ROOM_H + 4, 2, frameColor);
}

// ── Title band ───────────────────────────────────────────────────────────────
cv.rect(0, 0, W, TITLE_H, C.titleBg);
cv.drawText(MARGIN, 18, 'JUNGLE X · ROOM CATALOG', 5, C.text);
cv.drawText(MARGIN, 70, `EVERY CONNECTOR + ANCHOR/REQUIRED ROOM  ·  ${total} ROOMS  ·  29×17 TILES EACH  ·  MANGO DEAD-ENDS EXCLUDED`, 2, C.dim);
cv.drawText(MARGIN, 96, 'TAGS:  START = ALSO RUN-START   PLACED/UNPLACED = ADAPTER USAGE   PANTHER = HAS BOSS   ALT = SAVED, NOT IN ROTATION', 2, C.dim);

// ── Sections ─────────────────────────────────────────────────────────────────
let y = TITLE_H;
for (const s of sections) {
  y += SECTION_GAP;
  cv.drawText(MARGIN, y + 6, s.title, 3, s.cat);
  const cnt = `(${s.items.length})`;
  cv.drawText(MARGIN + GRID_W - (cv.textWidth(cnt, 3) - 3), y + 6, cnt, 3, s.cat);
  cv.rect(MARGIN, y + HEADER_H - 8, GRID_W, 3, s.cat);
  y += HEADER_H;

  s.items.forEach((it, i) => {
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const x = MARGIN + col * (ROOM_W + GAP_X);
    const cy = y + row * ROW_H;
    drawRoom(x, cy, it.walls, it.frame, it.stump);
    const lx = x + ROOM_W / 2;
    cv.textCentered(lx, cy + ROOM_H + 7, it.name, 2, C.text);
    if (it.note) cv.textCentered(lx, cy + ROOM_H + 24, it.note, 2, it.frame);
  });
  y += Math.ceil(s.items.length / COLS) * ROW_H;
}

// ── Write ────────────────────────────────────────────────────────────────────
const outDir = path.join(projectRoot, 'sample-maps');
fs.mkdirSync(outDir, { recursive: true });
const png = cv.toPNG();
const outPath = path.join(outDir, 'room-catalog.png');
fs.writeFileSync(outPath, png);
console.log(`Room catalog -> ${outPath}  ${W}×${H}px  ${Math.round(png.length / 1024)}KB  (${total} rooms)`);
for (const s of sections) console.log(`  ${s.items.length.toString().padStart(2)}  ${s.title}`);
