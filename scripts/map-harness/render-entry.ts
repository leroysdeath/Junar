// esbuild entry shim for the PNG renderers (scripts/map-harness/render-maps.mjs
// and render-room-catalog.mjs).
//
// Re-exports the pure room-grid generator, the room-template pools, the
// catalog-only debug defs, and the geometry constants the renderers need, so
// esbuild can bundle them into a single node-runnable ESM module with no
// browser/React/canvas dependencies. See entry.ts (the sibling shim for the
// opening-audit harness).
export {
  generateRunMap,
  findPath,
  ANCHOR_HUB_DEFS,
  GROVE_DEF,
  BOSS_VERSIONS,
  MINIBOSS_DEFS,
} from '../../src/game/RoomGrid';
export {
  FABRIC_TEMPLATE_POOL,
  ADAPTER_TEMPLATE_POOL,
} from '../../src/game/RoomTemplates';
export {
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  ROOM_GRID_COLS,
  ROOM_GRID_ROWS,
  MANGO_TILE_BY_TEMPLATE,
} from '../../src/game/constants';
