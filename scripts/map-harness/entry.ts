// esbuild entry shim for the map-generation harness (scripts/map-harness).
//
// Re-exports the pure room-grid generator + the geometry constants the harness
// needs, so esbuild can bundle them into a single node-runnable ESM module with
// no browser/React/canvas dependencies. The harness imports the bundle and
// audits opening reciprocity across many seeds. See check-openings.mjs.
export {
  generateRunMap,
  renderRunMapAscii,
  oppositeEdge,
  roomsConnect,
  openingsOnEdge,
  findPath,
  roomAt,
} from '../../src/game/RoomGrid';
export {
  GRID_WIDTH,
  GRID_HEIGHT,
  ROOM_GRID_COLS,
  ROOM_GRID_ROWS,
} from '../../src/game/constants';
