import {
  Vector2,
  EnemyType,
  Rectangle,
  HuntState,
  RoomGridCoord,
} from './types';
import { Level } from './Level';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TILE_SIZE,
  ENEMY_AABB_PX,
  ENEMY_VISUAL_PX,
  ENEMY_PATHFIND_REPOLL_MS,
  BOSS_PANTHER_SPEED,
  BOSS_PANTHER_HP,
  BOSS_PANTHER_AABB_PX,
  BOSS_PANTHER_VISUAL_PX,
} from './constants';

export class Enemy {
  private position: Vector2;
  private type: EnemyType;
  private id: number;
  private speed: number;
  // Collision AABB extent (px), per type from ENEMY_AABB_PX. The box is
  // centred inside the 32 px cell (see aabbAt); `position` remains the cell
  // top-left so the enemy centre stays position + TILE_SIZE/2.
  private size: number;
  private lastPathfindTime = 0;
  private targetPosition: Vector2;
  // While entering from outside the canvas, the AABB straddles an OOB
  // grid row (which counts as wall) and normal collision blocks all
  // movement. We bypass collision until the enemy is fully inside.
  private entering: boolean;
  private entryDirection: Vector2;

  // Hunt state machine (Step 4, roadmap §5.12). Driven by Hunt.ts off the
  // gameLoop currentTime + room position; see docs/ROADMAP-traversable-maps.md.
  //   • huntState defaults to 'active': the only enemies built today are
  //     wave spawns, which pursue immediately. Placed statics (Step 5+6) are
  //     constructed then set 'dormant'. Dormant + activating enemies hold
  //     position (the movement guard in update()); active + hunting pursue.
  //   • currentRoom is the room-grid cell this enemy occupies. Game stamps it
  //     on spawn and updates it as a hunter crosses rooms; it must always
  //     match the room bucket the enemy is parked in.
  //   • activatingSince is the currentTime at which an aggro delay began
  //     (only meaningful while huntState === 'activating').
  private huntState: HuntState = 'active';
  private currentRoom: RoomGridCoord = { col: 0, row: 0 };
  private activatingSince = 0;

  // --- Mini-boss overrides (owner 2026-06-19) ---
  // A boss is a normal panther with isBoss=true plus per-instance size/visual/
  // speed/hp overrides (set by configureAsBoss). hp defaults to 1 so every
  // normal enemy keeps one-hit death; the boss takes BOSS_PANTHER_HP arrow hits.
  // Its bespoke movement runs in Game.updateBossPanther (not Enemy.update), so
  // these fields only carry identity + stats, not the AI state machine.
  private isBossFlag = false;
  // Allegiance (owner 2026-06-20). A freed panther ally is a normal-stat panther
  // with isAlly=true; Game stores it OUTSIDE this.enemies and drives it via
  // Game.updateAllyPanther, so this flag only carries identity (friend vs foe).
  private isAllyFlag = false;
  private hp = 1;
  // Per-instance render size; defaults to the type's ENEMY_VISUAL_PX, overridden
  // for the boss. Renderer reads getVisualSize() instead of the type constant.
  private visualSize: number;

  // Doorway-arrival kill grace: a gameLoop-currentTime deadline before which
  // this enemy cannot contact-kill (Game.checkCollisions skips it) and the
  // renderer draws a materialize flash over it. Stamped by
  // Game.settleHunterIntoRoom when a cross-room hunter lands in the player's
  // current room — it would otherwise appear and kill on the same tick, with
  // no rendered frame of it first (owner-approved 2026-06-10; see
  // HUNTER_ARRIVAL_GRACE_MS in constants.ts). 0 = no grace pending.
  private arrivalGraceUntil = 0;

  constructor(
    startPosition: Vector2,
    type: EnemyType,
    id: number,
    level?: Level,
    entry?: { direction: Vector2 },
  ) {
    this.type = type;
    this.id = id;
    // Per-type collision AABB extent (px), centred inside the 32 px cell.
    this.size = ENEMY_AABB_PX[type];
    this.visualSize = ENEMY_VISUAL_PX[type];

    // Entering enemies spawn at world coords outside the canvas; they
    // shouldn't be snapped to a "safe" tile. Skip findSafeSpawnPosition.
    if (entry) {
      this.position = { ...startPosition };
    } else if (level) {
      // Spawn-safety nudge works on the 32 px cell footprint (the
      // positioning unit), independent of the per-type AABB.
      this.position = level.findSafeSpawnPosition(startPosition, TILE_SIZE);
    } else {
      this.position = { ...startPosition };
    }
    this.targetPosition = { ...startPosition };
    this.entering = !!entry;
    this.entryDirection = entry?.direction ?? { x: 0, y: 0 };

    // Speeds in px/s. Calibrated relative to player at 150 px/s:
    //   panther ~2.6x player, bear ~1.45x, snake ~0.45x, gibbon ~0.23x.
    // Panthers and bears outrun the player in open space; snakes and
    // gibbons are easy to outpace. Combat depends on chokepoints.
    switch (type) {
      case 'panther':
        this.speed = 395;
        break;
      case 'bear':
        this.speed = 218;
        break;
      case 'snake':
        this.speed = 68;
        break;
      case 'gibbon':
        this.speed = 34;
        break;
    }
  }

  // "Fully inside" is measured against the 32 px render cell (the
  // positioning unit), not the per-type AABB — so the handoff from
  // free-entry movement to grid collision is identical for every type.
  isFullyInside(): boolean {
    return (
      this.position.x >= 0 &&
      this.position.x + TILE_SIZE <= CANVAS_WIDTH &&
      this.position.y >= 0 &&
      this.position.y + TILE_SIZE <= CANVAS_HEIGHT
    );
  }

  update(
    deltaTime: number,
    currentTime: number,
    playerPosition: Vector2,
    level: Level,
    others: Enemy[] = [],
  ) {
    // Dormant + activating enemies hold position — a placed static waits to be
    // aggroed, and a waking one stays put during its STATIC_AGGRO_DELAY_MS
    // before pursuing. Movement begins only once Hunt promotes it to 'active'
    // (or, on the player leaving, 'hunting'). Neither state is ever 'entering'
    // (statics are placed in-room, not walked in off-canvas), so this guard is
    // safe ahead of the entry branch. For cross-room hunters, `playerPosition`
    // is the door target Game steers them toward, not the literal player.
    if (this.huntState === 'dormant' || this.huntState === 'activating') return;

    if (this.entering) {
      // Free movement along the entry vector while the cell straddles OOB.
      const dist = this.speed * (deltaTime / 1000);
      this.position.x += this.entryDirection.x * dist;
      this.position.y += this.entryDirection.y * dist;
      if (this.isFullyInside()) {
        // Snap the 32 px cell to the canvas edge for a clean handoff into
        // grid collision.
        if (this.entryDirection.y > 0 && this.position.y < 0)
          this.position.y = 0;
        if (this.entryDirection.x > 0 && this.position.x < 0)
          this.position.x = 0;
        if (
          this.entryDirection.y < 0 &&
          this.position.y + TILE_SIZE > CANVAS_HEIGHT
        )
          this.position.y = CANVAS_HEIGHT - TILE_SIZE;
        if (
          this.entryDirection.x < 0 &&
          this.position.x + TILE_SIZE > CANVAS_WIDTH
        )
          this.position.x = CANVAS_WIDTH - TILE_SIZE;
        this.entering = false;
      }
      return;
    }

    // Repoll the pursuit target on the gameLoop clock (Invariant 8 — this was
    // the last wall-clock timestamp in src/game/ outside Logger.ts; the rAF
    // clock is immune to pause/resume drift and OS clock changes) at most every
    // ENEMY_PATHFIND_REPOLL_MS — except for cross-room hunters, which re-poll
    // every frame. Game.updateHunters feeds a 'hunting' enemy a fresh door
    // target each frame; throttling left it steering toward a stale door (up to
    // ~79 px of misdirected travel for a panther) and wavering at openings, a
    // big part of why pursuit felt laggy (owner decision 2026-06-13: hunters
    // should run the player down). The ray-sample to one in-room door cell is
    // cheap enough to run every frame.
    const repollNow =
      this.huntState === 'hunting' ||
      currentTime - this.lastPathfindTime > ENEMY_PATHFIND_REPOLL_MS;
    if (repollNow) {
      this.targetPosition = this.findPathToPlayer(playerPosition, level);
      this.lastPathfindTime = currentTime;
    }

    // Move towards target
    const dx = this.targetPosition.x - this.position.x;
    const dy = this.targetPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const moveDistance = this.speed * (deltaTime / 1000);

    if (distance > 5) {
      const newX = this.position.x + (dx / distance) * moveDistance;
      const newY = this.position.y + (dy / distance) * moveDistance;

      // Resolve walls per-axis so the enemy still slides along a wall: try
      // X against the current Y, then Y against the resolved X. The centred
      // AABB (per-type `size`) is what's tested — a 34 px bear straddles two
      // columns and so is blocked from 1-tile corridors.
      let candX = this.position.x;
      let candY = this.position.y;
      if (!this.collidesWall(newX, this.position.y, level)) candX = newX;
      if (!this.collidesWall(candX, newY, level)) candY = newY;

      // Wall-pin escape: a 34 px bear's centred AABB overhangs its 32 px cell
      // by 1 px, so one parked against a corridor's edge column clips the
      // adjacent wall column on EVERY step — both axis moves reject and
      // candX/candY never leave the current position. Assigning that
      // zero-net-movement "success" below would freeze the bear permanently
      // (the jitter fallback only fired on enemy-vs-enemy overlap), so an
      // off-target (distance > 5) step the walls zeroed out routes to the
      // same jitter-then-hold fallback and the bear slides off the wall
      // toward the corridor centre. No-op for enemies that fit their cell:
      // their per-axis resolution only zeroes out in a true dead end, where
      // jitter holds position anyway.
      const wallPinned = candX === this.position.x && candY === this.position.y;

      // Enemy-vs-enemy no-overlap (snake-snake exempt, §5.8). If the
      // wall-resolved step would overlap another enemy, reject it and jitter
      // to a random clear cardinal; hold position if none is clear.
      if (!wallPinned && !this.overlapsEnemy(candX, candY, others)) {
        this.position.x = candX;
        this.position.y = candY;
      } else {
        this.jitter(moveDistance, level, others);
      }
    } else if (this.overlapsEnemy(this.position.x, this.position.y, others)) {
      // Settled at the target (distance ≤ 5) but overlapping another enemy:
      // the movement branch above is skipped, so without this two enemies
      // that converged on the same spot would freeze permanently in overlap.
      // Nudge apart (snake-snake is already exempt inside overlapsEnemy).
      this.jitter(moveDistance, level, others);
    }
  }

  // World-space collision AABB: the per-type box (`size`) centred inside the
  // 32 px cell at `position`. The centre stays at position + TILE_SIZE/2, so
  // Game.ts targeting/contact/arrow math (which assumes that centre) is
  // unaffected by the variable size.
  getAABB(): Rectangle {
    return this.aabbAt(this.position.x, this.position.y);
  }

  // True if this enemy's centred AABB would sit free of walls and of other
  // enemies at the given cell top-left (snake-snake overlap exempt, §5.8 — via
  // overlapsEnemy). Used by the Hunt de-aggro settlement (Step 5+6) to test
  // candidate landing tiles before relocating a de-aggroing hunter, reusing the
  // exact Step 2 collision rules rather than duplicating them in Game.
  canSettleAt(
    cellX: number,
    cellY: number,
    level: Level,
    others: Enemy[],
  ): boolean {
    return (
      !this.collidesWall(cellX, cellY, level) &&
      !this.overlapsEnemy(cellX, cellY, others)
    );
  }

  // Move by (dx,dy) px this frame, resolving walls per-axis (slide along a wall)
  // with the same rules as update(): try X against current Y, then Y against the
  // resolved X, testing the centred AABB via collidesWall. Clamps to the canvas.
  // Returns whether any net movement happened (the boss AI uses this to detect a
  // lunge that hit a wall). Used by Game.updateBossPanther so the boss respects
  // walls exactly like every other enemy and its weave/juke can't tunnel through.
  tryMove(dx: number, dy: number, level: Level): { moved: boolean } {
    const newX = this.position.x + dx;
    const newY = this.position.y + dy;
    let candX = this.position.x;
    let candY = this.position.y;
    if (!this.collidesWall(newX, this.position.y, level)) candX = newX;
    if (!this.collidesWall(candX, newY, level)) candY = newY;
    candX = Math.max(0, Math.min(candX, CANVAS_WIDTH - TILE_SIZE));
    candY = Math.max(0, Math.min(candY, CANVAS_HEIGHT - TILE_SIZE));
    const moved =
      candX !== this.position.x || candY !== this.position.y;
    this.position.x = candX;
    this.position.y = candY;
    return { moved };
  }

  private aabbAt(cellX: number, cellY: number): Rectangle {
    const offset = (TILE_SIZE - this.size) / 2;
    return {
      x: cellX + offset,
      y: cellY + offset,
      width: this.size,
      height: this.size,
    };
  }

  // True if the centred AABB at the given cell top-left overlaps any wall
  // tile. Scans every grid cell the AABB touches — correct for sizes both
  // under one tile (snake) and over (a 34 px bear straddles two columns, so
  // it cannot fit a 1-tile corridor).
  private collidesWall(cellX: number, cellY: number, level: Level): boolean {
    const box = this.aabbAt(cellX, cellY);
    const gx1 = Math.floor(box.x / TILE_SIZE);
    const gy1 = Math.floor(box.y / TILE_SIZE);
    const gx2 = Math.floor((box.x + box.width - 1) / TILE_SIZE);
    const gy2 = Math.floor((box.y + box.height - 1) / TILE_SIZE);
    for (let gy = gy1; gy <= gy2; gy++) {
      for (let gx = gx1; gx <= gx2; gx++) {
        if (level.isWall(gx, gy)) return true;
      }
    }
    return false;
  }

  // True if the centred AABB at the given cell top-left overlaps another
  // enemy. Snake-vs-snake overlap is allowed (writhing pile / pack, §5.8);
  // still-entering enemies are off-canvas and excluded as obstacles.
  private overlapsEnemy(
    cellX: number,
    cellY: number,
    others: Enemy[],
  ): boolean {
    const box = this.aabbAt(cellX, cellY);
    for (const other of others) {
      if (other === this) continue;
      if (other.entering) continue;
      if (this.type === 'snake' && other.type === 'snake') continue;
      // Big cats and bears brush past the 4 px snake sliver instead of stalling
      // behind a writhing pile (owner decision 2026-06-13): a snake never blocks
      // a panther's or bear's movement, so a fast chaser can't get plugged in a
      // corridor by pursuing snakes converging on the same target. Directional —
      // a snake mover still respects the larger body (it won't phase through a
      // bear). The player-kill test is separate (Game.enemyTouchesPlayer), so
      // this only affects enemy-vs-enemy routing, never contact-death.
      if (
        other.type === 'snake' &&
        (this.type === 'panther' || this.type === 'bear')
      ) {
        continue;
      }
      const o = other.getAABB();
      if (
        box.x < o.x + o.width &&
        box.x + box.width > o.x &&
        box.y < o.y + o.height &&
        box.y + box.height > o.y
      ) {
        return true;
      }
    }
    return false;
  }

  // Reject-and-jitter (§5.8): try a random clear cardinal nudge of the same
  // step magnitude; take the first that clears both walls and other enemies.
  // If none is clear, hold position this tick.
  private jitter(moveDistance: number, level: Level, others: Enemy[]) {
    const dirs = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    // Fisher–Yates shuffle. Math.random is fine here — it's not simulation
    // timing, so Invariant 8 (no Date.now in sim) doesn't apply.
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const d of dirs) {
      const jx = this.position.x + d.x * moveDistance;
      const jy = this.position.y + d.y * moveDistance;
      if (
        !this.collidesWall(jx, jy, level) &&
        !this.overlapsEnemy(jx, jy, others)
      ) {
        this.position.x = jx;
        this.position.y = jy;
        return;
      }
    }
    // Fully blocked → hold position this tick.
  }

  private findPathToPlayer(playerPosition: Vector2, level: Level): Vector2 {
    // Simple direct pathfinding - move towards player. Tile-only and
    // enemy-agnostic by design; transient enemy blocks are handled by the
    // jitter in update(), not here.
    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return this.position;

    // Check if direct path is clear (sample every half-tile).
    const steps = Math.ceil(distance / (TILE_SIZE / 2));
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 1; i <= steps; i++) {
      const checkX = this.position.x + stepX * i;
      const checkY = this.position.y + stepY * i;
      const gridX = Math.floor(checkX / TILE_SIZE);
      const gridY = Math.floor(checkY / TILE_SIZE);

      if (level.isWall(gridX, gridY)) {
        // Direct line is blocked by a wall — route around it with a real
        // shortest-path search rather than a greedy step (see findAlternativePath).
        return this.findAlternativePath(playerPosition, level);
      }
    }

    return playerPosition;
  }

  // Shortest-route pathfinding around walls. The original fallback was a greedy
  // hill-climb — "step to the open cardinal neighbour nearest the player in
  // straight-line distance" — which gets trapped in local minima: when a wall
  // column extends between the enemy and the player, every step that shrinks the
  // straight-line gap runs into the wall, while routing down and around the
  // wall's end momentarily *increases* it, so the enemy never takes it and just
  // oscillates in place (the "panther stuck going up and down" bug). Instead we
  // run a breadth-first search over the room's tile grid (≤493 cells — cheap
  // even per-frame for cross-room hunters) from the enemy's tile to the target's
  // tile, giving the true nearest route. Then we aim the enemy at the farthest
  // tile along that route it still has a clear straight line to (path smoothing)
  // so it slides in long segments toward the corner instead of tile-stepping.
  // The old best-cardinal step survives only as a last resort when the target is
  // walled off entirely (bestCardinalStep).
  private findAlternativePath(playerPosition: Vector2, level: Level): Vector2 {
    const w = level.getWidth();
    const h = level.getHeight();
    const half = TILE_SIZE / 2;
    const clamp = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);

    // Work in tile coords, anchored on each box's centre (position is cell
    // top-left, so the occupied cell is centre / TILE_SIZE).
    const startTX = clamp(
      Math.floor((this.position.x + half) / TILE_SIZE),
      w - 1,
    );
    const startTY = clamp(
      Math.floor((this.position.y + half) / TILE_SIZE),
      h - 1,
    );
    const goalTX = clamp(
      Math.floor((playerPosition.x + half) / TILE_SIZE),
      w - 1,
    );
    const goalTY = clamp(
      Math.floor((playerPosition.y + half) / TILE_SIZE),
      h - 1,
    );

    const startIdx = startTY * w + startTX;
    const goalIdx = goalTY * w + goalTX;
    if (startIdx === goalIdx) return playerPosition;

    // BFS over open tiles. `prev` doubles as the visited marker (-1 = unvisited);
    // the start cell is its own parent so it reads as visited without a sentinel.
    const prev = new Int32Array(w * h).fill(-1);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    queue[tail++] = startIdx;
    prev[startIdx] = startIdx;
    let found = false;
    while (head < tail) {
      const cur = queue[head++];
      if (cur === goalIdx) {
        found = true;
        break;
      }
      const cx = cur % w;
      const cy = (cur - cx) / w;
      const neighbours = [
        cy > 0 ? cur - w : -1, // up
        cy < h - 1 ? cur + w : -1, // down
        cx > 0 ? cur - 1 : -1, // left
        cx < w - 1 ? cur + 1 : -1, // right
      ];
      for (const nb of neighbours) {
        if (nb < 0 || prev[nb] !== -1) continue;
        const nx = nb % w;
        const ny = (nb - nx) / w;
        if (level.isWall(nx, ny)) continue;
        prev[nb] = cur;
        queue[tail++] = nb;
      }
    }

    // Target walled off / unreachable — greedy step is the best we can do.
    if (!found) return this.bestCardinalStep(playerPosition, level);

    // Reconstruct the route goal→start, reverse to start→goal.
    const path: number[] = [];
    let n = goalIdx;
    while (n !== startIdx) {
      path.push(n);
      n = prev[n];
    }
    path.push(startIdx);
    path.reverse(); // path[0] = start tile

    // Path smoothing: aim at the farthest route tile the enemy can still reach by
    // a clear straight ray, so it cuts toward the wall's corner in one motion.
    let waypoint = path.length > 1 ? path[1] : path[0];
    for (let i = path.length - 1; i >= 1; i--) {
      const tx = path[i] % w;
      const ty = (path[i] - tx) / w;
      if (
        this.clearRayToCenter(
          tx * TILE_SIZE + half,
          ty * TILE_SIZE + half,
          level,
        )
      ) {
        waypoint = path[i];
        break;
      }
    }
    const wx = waypoint % w;
    const wy = (waypoint - wx) / w;
    return { x: wx * TILE_SIZE, y: wy * TILE_SIZE };
  }

  // Center-to-center wall raycast from this enemy's centre to a world point,
  // sampled every ~8 px (mirrors Game.hasDirectLineOfSight). True if unblocked.
  private clearRayToCenter(
    targetX: number,
    targetY: number,
    level: Level,
  ): boolean {
    const ex = this.position.x + TILE_SIZE / 2;
    const ey = this.position.y + TILE_SIZE / 2;
    const dx = targetX - ex;
    const dy = targetY - ey;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return true;
    const steps = Math.ceil(dist / 8);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const gx = Math.floor((ex + dx * t) / TILE_SIZE);
      const gy = Math.floor((ey + dy * t) / TILE_SIZE);
      if (level.isWall(gx, gy)) return false;
    }
    return true;
  }

  // Greedy fallback used only when BFS finds no route (target walled off): step
  // to the open cardinal neighbour nearest the target in straight-line distance.
  // Can stall in local minima — acceptable as a genuine last resort.
  private bestCardinalStep(playerPosition: Vector2, level: Level): Vector2 {
    const directions = [
      { x: 0, y: -TILE_SIZE }, // Up
      { x: TILE_SIZE, y: 0 }, // Right
      { x: 0, y: TILE_SIZE }, // Down
      { x: -TILE_SIZE, y: 0 }, // Left
    ];

    let bestDirection = { x: 0, y: 0 };
    let bestScore = Infinity;

    directions.forEach((dir) => {
      const newX = this.position.x + dir.x;
      const newY = this.position.y + dir.y;
      const gridX = Math.floor(newX / TILE_SIZE);
      const gridY = Math.floor(newY / TILE_SIZE);

      if (
        !level.isWall(gridX, gridY) &&
        newX >= 0 &&
        newX < CANVAS_WIDTH &&
        newY >= 0 &&
        newY < CANVAS_HEIGHT
      ) {
        const distanceToPlayer = Math.sqrt(
          Math.pow(newX - playerPosition.x, 2) +
            Math.pow(newY - playerPosition.y, 2),
        );

        if (distanceToPlayer < bestScore) {
          bestScore = distanceToPlayer;
          bestDirection = { x: newX, y: newY };
        }
      }
    });

    return bestDirection.x === 0 && bestDirection.y === 0
      ? this.position
      : bestDirection;
  }

  getPosition(): Vector2 {
    return { ...this.position };
  }

  // Hard-set the cell top-left. Used by hunter room transitions and by the
  // Hunt de-aggro settlement to relocate the enemy (mirrors Player.setPosition).
  // Caller is responsible for choosing a wall-free landing spot.
  setPosition(pos: Vector2): void {
    this.position = { ...pos };
  }

  // Discard the cached pursuit target so the next update() re-polls immediately.
  // Called after a hard teleport (a hunter crossing into a new room) — the
  // pathfind throttle would otherwise keep steering toward the previous room's
  // door cell (a stale point in the shared canvas frame) for one ~200 ms
  // window. Resetting both fields makes the relocated hunter re-target its new
  // in-room goal on the very next frame.
  resetPathfinding(): void {
    this.lastPathfindTime = 0;
    this.targetPosition = { ...this.position };
  }

  getType(): EnemyType {
    return this.type;
  }

  getId(): number {
    return this.id;
  }

  getSpeed(): number {
    return this.speed;
  }

  // --- Mini-boss (owner 2026-06-19) ---

  // Promote this panther to the enlarged mini-boss: bigger kill/collision box,
  // bigger sprite, faster than arrows, and multi-hit HP. Movement is driven by
  // Game.updateBossPanther, not Enemy.update. Call once right after construction.
  configureAsBoss(): void {
    this.isBossFlag = true;
    this.size = BOSS_PANTHER_AABB_PX;
    this.visualSize = BOSS_PANTHER_VISUAL_PX;
    this.speed = BOSS_PANTHER_SPEED;
    this.hp = BOSS_PANTHER_HP;
  }

  getIsBoss(): boolean {
    return this.isBossFlag;
  }

  getHp(): number {
    return this.hp;
  }

  // Apply one arrow hit. Returns true if this hit was lethal (hp ≤ 0), so the
  // caller splices the enemy. Normal enemies have hp 1 → always lethal (one-hit
  // death preserved); the boss survives until its HP is spent.
  takeHit(): boolean {
    this.hp -= 1;
    return this.hp <= 0;
  }

  getVisualSize(): number {
    return this.visualSize;
  }

  // --- Ally (owner 2026-06-20) ---
  // Promote this panther to a player-side ally. Unlike configureAsBoss it keeps
  // every panther stat (speed/size/visual/hp) — the flag only marks allegiance.
  // Movement is driven by Game.updateAllyPanther (approach/escort via the shared
  // Enemy.update pursuit, lunge/jump-back via tryMove), and Game stores the ally
  // outside this.enemies so auto-fire, arrows, the contact-kill pass and the
  // per-room parking all exclude it by construction (it follows the player like
  // the player, not the enemies). Call once right after construction.
  configureAsAlly(): void {
    this.isAllyFlag = true;
  }

  getIsAlly(): boolean {
    return this.isAllyFlag;
  }

  // --- Hunt state machine accessors (Step 4, roadmap §5.12) ---

  getHuntState(): HuntState {
    return this.huntState;
  }

  setHuntState(state: HuntState): void {
    this.huntState = state;
  }

  // The room-grid cell this enemy occupies. Returned by reference for the
  // per-frame Manhattan check; treat it as read-only (use setCurrentRoom to
  // move the enemy between rooms).
  getCurrentRoom(): RoomGridCoord {
    return this.currentRoom;
  }

  setCurrentRoom(coord: RoomGridCoord): void {
    this.currentRoom = { col: coord.col, row: coord.row };
  }

  getActivatingSince(): number {
    return this.activatingSince;
  }

  setActivatingSince(currentTime: number): void {
    this.activatingSince = currentTime;
  }

  // Doorway-arrival kill-grace deadline (gameLoop currentTime; 0 = none).
  getArrivalGraceUntil(): number {
    return this.arrivalGraceUntil;
  }

  setArrivalGraceUntil(until: number): void {
    this.arrivalGraceUntil = until;
  }
}
